// Copyright (c) .NET Foundation and contributors. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import * as chai from 'chai';
import * as chai_as_promised from 'chai-as-promised';
chai.use(chai_as_promised);
const expect = chai.expect;

import { ClientMapper } from '../../clientMapper';
import { TestKernelTransport } from './testKernelTransport';
import { CallbackTestKernelTransport } from './callbackTestKernelTransport';
import { CodeSubmissionReceivedType, CompleteCodeSubmissionReceivedType, CommandSucceededType, DisplayedValueProducedType, ReturnValueProducedType, DisplayedValueUpdatedType, CommandFailedType } from '../../interfaces/contracts';
import { createUri, debounce, wait } from '../../utilities';
import * as vscodeLike from '../../interfaces/vscode-like';
import { createKernelTransportConfig, decodeNotebookCellOutputs } from './utilities';
import { Logger } from '../../logger';

describe('InteractiveClient tests', () => {
    before(() => {
        Logger.configure("test", () => { });
    });

    it('command execution returns deferred events', async () => {
        const token = 'test-token';
        const code = '1 + 1';
        const config = createKernelTransportConfig(async (notebookPath) => new TestKernelTransport({
            'SubmitCode': [
                {
                    // deferred event; unassociated with the original submission; has its own token
                    eventType: DisplayedValueProducedType,
                    event: {
                        value: '',
                        valueId: null,
                        formattedValues: [
                            {
                                mimeType: 'text/plain',
                                value: 'deferred output'
                            }
                        ]
                    },
                    token: 'deferredCommand::token-for-deferred-command-doesnt-match-any-other-token'
                },
                {
                    eventType: CodeSubmissionReceivedType,
                    event: {
                        code: code
                    },
                    token
                },
                {
                    eventType: CompleteCodeSubmissionReceivedType,
                    event: {
                        code: code
                    },
                    token
                },
                {
                    eventType: ReturnValueProducedType,
                    event: {
                        value: 2,
                        valueId: null,
                        formattedValues: [
                            {
                                mimeType: 'text/html',
                                value: '2'
                            }
                        ]
                    },
                    token
                },
                {
                    eventType: CommandSucceededType,
                    event: {},
                    token
                }
            ]
        }));
        const clientMapper = new ClientMapper(config);
        const client = await clientMapper.getOrAddClient(createUri('test/path'));
        let result: Array<vscodeLike.NotebookCellOutput> = [];
        await client.execute(code, 'csharp', outputs => result = outputs, _ => { }, { token });
        const decodedResults = decodeNotebookCellOutputs(result);
        expect(decodedResults).to.deep.equal([
            {
                id: '1',
                items: [
                    {
                        mime: 'text/plain',
                        decodedData: 'deferred output',
                    }
                ]
            },
            {
                id: '2',
                items: [
                    {
                        mime: 'text/html',
                        decodedData: '2',
                    }
                ]
            }
        ]);
    });

    it('deferred events do not interfere with display update events', async () => {
        const token = 'test-token';
        const code = '1 + 1';
        const config = createKernelTransportConfig(async (notebookPath) => new TestKernelTransport({
            'SubmitCode': [
                {
                    // deferred event; unassociated with the original submission; has its own token
                    eventType: DisplayedValueProducedType,
                    event: {
                        value: '',
                        valueId: null,
                        formattedValues: [
                            {
                                mimeType: 'text/plain',
                                value: 'deferred output'
                            }
                        ]
                    },
                    token: 'deferredCommand::123'
                },
                {
                    eventType: DisplayedValueProducedType,
                    event: {
                        value: 1,
                        valueId: "displayId",
                        formattedValues: [
                            {
                                mimeType: 'text/html',
                                value: '1'
                            }
                        ]
                    },
                    token
                },
                {
                    eventType: DisplayedValueUpdatedType,
                    event: {
                        value: 2,
                        valueId: "displayId",
                        formattedValues: [
                            {
                                mimeType: 'text/html',
                                value: '2'
                            }
                        ]
                    },
                    token
                },
                {
                    eventType: CommandSucceededType,
                    event: {},
                    token
                }
            ]
        }));
        const clientMapper = new ClientMapper(config);
        const client = await clientMapper.getOrAddClient(createUri('test/path'));
        let result: Array<vscodeLike.NotebookCellOutput> = [];
        await client.execute(code, 'csharp', outputs => result = outputs, _ => { }, { token });
        const decodedResults = decodeNotebookCellOutputs(result);
        expect(decodedResults).to.deep.equal([
            {
                id: '1',
                items: [
                    {
                        mime: 'text/plain',
                        decodedData: 'deferred output',
                    }
                ]
            },
            {
                id: '3',
                items: [
                    {
                        mime: 'text/html',
                        decodedData: '2',
                    }
                ]
            }
        ]);
    });

    it('interleaved deferred events do not interfere with display update events', async () => {
        const token = 'test-token';
        const code = '1 + 1';
        const config = createKernelTransportConfig(async (notebookPath) => new TestKernelTransport({
            'SubmitCode': [
                {
                    // deferred event; unassociated with the original submission; has its own token
                    eventType: DisplayedValueProducedType,
                    event: {
                        value: '',
                        valueId: null,
                        formattedValues: [
                            {
                                mimeType: 'text/plain',
                                value: 'deferred output 1'
                            }
                        ]
                    },
                    token: 'deferredCommand::123'
                },
                {
                    eventType: DisplayedValueProducedType,
                    event: {
                        value: 1,
                        valueId: "displayId",
                        formattedValues: [
                            {
                                mimeType: 'text/html',
                                value: '1'
                            }
                        ]
                    },
                    token
                },
                {
                    // deferred event; unassociated with the original submission; has its own token
                    eventType: DisplayedValueProducedType,
                    event: {
                        value: '',
                        valueId: null,
                        formattedValues: [
                            {
                                mimeType: 'text/plain',
                                value: 'deferred output 2'
                            }
                        ]
                    },
                    token: 'deferredCommand::456'
                },
                {
                    eventType: DisplayedValueUpdatedType,
                    event: {
                        value: 2,
                        valueId: "displayId",
                        formattedValues: [
                            {
                                mimeType: 'text/html',
                                value: '2'
                            }
                        ]
                    },
                    token
                },
                {
                    eventType: CommandSucceededType,
                    event: {},
                    token
                }
            ]
        }));
        const clientMapper = new ClientMapper(config);
        const client = await clientMapper.getOrAddClient(createUri('test/path'));
        let result: Array<vscodeLike.NotebookCellOutput> = [];
        await client.execute(code, 'csharp', outputs => result = outputs, _ => { }, { token });
        const decodedResults = decodeNotebookCellOutputs(result);
        expect(decodedResults).to.deep.equal([
            {
                id: '1',
                items: [
                    {
                        mime: 'text/plain',
                        decodedData: 'deferred output 1',
                    }
                ]
            },
            {
                id: '4',
                items: [
                    {
                        mime: 'text/html',
                        decodedData: '2',
                    }
                ]
            },
            {
                id: '3',
                items: [
                    {
                        mime: 'text/plain',
                        decodedData: 'deferred output 2',
                    }
                ]
            }
        ]);
    });

    it('display update events from separate submissions trigger the correct observer', async () => {
        const code = '1 + 1';
        const config = createKernelTransportConfig(async (notebookPath) => new TestKernelTransport({
            'SubmitCode#1': [
                {
                    eventType: DisplayedValueProducedType,
                    event: {
                        value: 1,
                        valueId: "displayId",
                        formattedValues: [
                            {
                                mimeType: 'text/html',
                                value: '1'
                            }
                        ]
                    },
                    token: 'token 1'
                },
                {
                    eventType: CommandSucceededType,
                    event: {},
                    token: 'token 1'
                }
            ],
            'SubmitCode#2': [
                {
                    eventType: DisplayedValueProducedType,
                    event: {
                        value: 2,
                        valueId: "displayId",
                        formattedValues: [
                            {
                                mimeType: 'text/html',
                                value: '2'
                            }
                        ]
                    },
                    token: 'token 2'
                },
                {
                    eventType: CommandSucceededType,
                    event: {},
                    token: 'token 2'
                }
            ]
        }));
        const clientMapper = new ClientMapper(config);
        const client = await clientMapper.getOrAddClient(createUri('test/path'));

        // execute first command
        let result1: Array<vscodeLike.NotebookCellOutput> = [];
        await client.execute(code, 'csharp', outputs => result1 = outputs, _ => { }, { token: 'token 1' });
        let decodedResults1 = decodeNotebookCellOutputs(result1);
        expect(decodedResults1).to.deep.equal([
            {
                id: '1',
                items: [
                    {
                        mime: 'text/html',
                        decodedData: '1',
                    }
                ]
            }
        ]);

        // execute second command
        let result2: Array<vscodeLike.NotebookCellOutput> = [];
        await client.execute(code, 'csharp', outputs => result2 = outputs, _ => { }, { token: 'token 2' });
        expect(result2).to.deep.equal([]);

        // ensure first result array was updated
        decodedResults1 = decodeNotebookCellOutputs(result1);
        expect(decodedResults1).to.deep.equal([
            {
                id: '2',
                items: [
                    {
                        mime: 'text/html',
                        decodedData: '2',
                    }
                ]
            }
        ]);
    });

    it('display events with multiple mimeTyoes', async () => {
        const code = '1 + 1';
        const config = createKernelTransportConfig(async (notebookPath) => new TestKernelTransport({
            'SubmitCode#1': [
                {
                    eventType: DisplayedValueProducedType,
                    event: {
                        value: 1,
                        valueId: "displayId",
                        formattedValues: [
                            {
                                mimeType: 'text/html',
                                value: '1'
                            },
                            {
                                mimeType: 'apllication/json',
                                value: '{}'
                            }
                        ]
                    },
                    token: 'token 1'
                },
                {
                    eventType: CommandSucceededType,
                    event: {},
                    token: 'token 1'
                }
            ]
        }));
        const clientMapper = new ClientMapper(config);
        const client = await clientMapper.getOrAddClient(createUri('test/path'));

        // execute first command
        let result1: Array<vscodeLike.NotebookCellOutput> = [];
        await client.execute(code, 'csharp', outputs => result1 = outputs, _ => { }, { token: 'token 1' });
        let decodedResults1 = decodeNotebookCellOutputs(result1);
        expect(decodedResults1).to.deep.equal([
            {
                id: '1',
                items: [
                    {
                        mime: 'text/html',
                        decodedData: '1',
                    }, {
                        mime: 'apllication/json',
                        decodedData: '{}'
                    }
                ]
            }
        ]);
    });

    it('CommandFailedEvent rejects the execution promise', (done) => {
        const token = 'token';
        const config = createKernelTransportConfig(async (notebookPath) => new TestKernelTransport({
            'SubmitCode': [
                {
                    eventType: CommandFailedType,
                    event: {},
                    token
                }
            ]
        }));
        const clientMapper = new ClientMapper(config);
        clientMapper.getOrAddClient(createUri('test/path')).then(client => {
            client.execute('bad-code-that-will-fail', 'csharp', _ => { }, _ => { }, { token }).then(result => {
                done(`expected execution to fail promise, but passed with: ${result}`);
            }).catch(_err => {
                done();
            });
        });
    });

    it('clientMapper can reassociate clients', (done) => {
        let transportCreated = false;
        const config = createKernelTransportConfig(async (_notebookPath) => {
            if (transportCreated) {
                done('transport already created; this function should not have been called again');
            }

            transportCreated = true;
            return new TestKernelTransport({});
        });
        const clientMapper = new ClientMapper(config);
        clientMapper.getOrAddClient(createUri('test-path.dib')).then(_client => {
            clientMapper.reassociateClient(createUri('test-path.dib'), createUri('updated-path.dib'));
            clientMapper.getOrAddClient(createUri('updated-path.dib')).then(_reassociatedClient => {
                done();
            });
        });
    });

    it('clientMapper reassociate does nothing for an untracked file', async () => {
        let transportCreated = false;
        const config = createKernelTransportConfig(async (_notebookPath) => {
            if (transportCreated) {
                throw new Error('transport already created; this function should not have been called again');
            }

            transportCreated = true;
            return new TestKernelTransport({});
        });
        const clientMapper = new ClientMapper(config);
        await clientMapper.getOrAddClient(createUri('test-path.dib'));
        clientMapper.reassociateClient(createUri('not-a-tracked-file.txt'), createUri('also-not-a-tracked-file.txt'));
        const _existingClient = await clientMapper.getOrAddClient(createUri('test-path.dib'));
        expect(clientMapper.isDotNetClient(createUri('not-a-tracked-file.txt'))).to.be.false;
        expect(clientMapper.isDotNetClient(createUri('also-not-a-tracked-file.txt'))).to.be.false;
    });

    it('execution prevents diagnostics request forwarding', async () => {
        const token = 'test-token';
        const config = createKernelTransportConfig(async (notebookPath) => new TestKernelTransport({
            'SubmitCode': [

                {
                    eventType: CommandSucceededType,
                    event: {},
                    token
                }
            ]
        }));
        const clientMapper = new ClientMapper(config);
        let diagnosticsCallbackFired = false;
        debounce("id0", 500, () => {
            diagnosticsCallbackFired = true;
        });

        const client = await clientMapper.getOrAddClient(createUri('test-path.dib'));
        await client.execute("1+1", "csharp", (_outputs) => { }, (_diagnostics) => { }, { token: token, id: "id0" });
        await wait(1000);
        expect(diagnosticsCallbackFired).to.be.false;
    });

    it('exception in submit code properly rejects all promises', done => {
        const token = 'test-token';
        const config = createKernelTransportConfig(async (_notebookPath) => new CallbackTestKernelTransport({
            'SubmitCode': () => {
                throw new Error('expected exception during submit');
            },
        }));
        const clientMapper = new ClientMapper(config);
        clientMapper.getOrAddClient(createUri('test-path.dib')).then(client => {
            expect(client.execute("1+1", "csharp", _outputs => { }, _diagnostics => { }, { token, id: '' })).eventually.rejectedWith('expected exception during submit').notify(done);
        });
    });

    it('exception in submit code properly generates error outputs', done => {
        const token = 'test-token';
        const config = createKernelTransportConfig(async (_notebookPath) => new CallbackTestKernelTransport({
            'SubmitCode': () => {
                throw new Error('expected exception during submit');
            },
        }));
        const clientMapper = new ClientMapper(config);
        let seenOutputs: Array<vscodeLike.NotebookCellOutput> = [];
        clientMapper.getOrAddClient(createUri('test-path.dib')).then(client => {
            expect(client.execute("1+1", "csharp", outputs => { seenOutputs = outputs; }, _diagnostics => { }, { token, id: '' })).eventually.rejected.then(() => {
                try {
                    const decodedOutputs = decodeNotebookCellOutputs(seenOutputs);
                    expect(decodedOutputs).to.deep.equal([{
                        id: '1',
                        items: [{
                            mime: vscodeLike.ErrorOutputMimeType,
                            decodedData: {
                                name: 'Error',
                                message: 'expected exception during submit',
                            },
                        }]
                    }]);
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });

    it('exception creating kernel transport gracefully fails', done => {
        const config = createKernelTransportConfig(async (_notebookPath) => {
            throw new Error('simulated error during transport creation');
        });
        const clientMapper = new ClientMapper(config);
        expect(clientMapper.getOrAddClient(createUri('fake-notebook'))).eventually.rejectedWith('simulated error during transport creation').notify(done);
    });

});
