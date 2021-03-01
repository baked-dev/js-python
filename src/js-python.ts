import { ChildProcessWithoutNullStreams, SendHandle, Serializable, spawn } from "child_process";
import { randomBytes } from "crypto";

class JSPython {

    private static instances: {
        [scriptPath: string]: JSPython;
    } = {};

    public static Instance (scriptPath: string, maxThreads: number = 2) {
        return this.instances[scriptPath] || (this.instances[scriptPath] = new this(scriptPath, maxThreads));
    }

    private log: boolean = true;
    private process: ChildProcessWithoutNullStreams;
    private queue: {
        args: string[],
        resolver: (result: string[]) => void;
    }[] = [];
    private ready: boolean = false;
    private resolveMap: {
        [key: string]: (result: string[]) => void;
    } = {};
    private threadCount = 0;

    private constructor (private scriptPath: string, public maxThreads: number = 2) {
        this.startPython();
    }

    public runTask = async (...args: string[]) => {
        if (this.threadCount >= this.maxThreads || !this.ready){
            return await new Promise((resolve) => {
                this.queue.push({
                    args,
                    resolver: resolve
                });
            });
        } else {
            const result = await this.doRunTask(...args);
            if (this.queue.length > 0) {
                const nextItem = this.queue.shift();
                this.runTask(...nextItem.args).then(nextItem.resolver);
            }
            return result;
        }
    }

    private startPython = async () => {
        this.process = spawn('python', [this.scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        this.process.stdout.on('data', this.processMessage);
        this.process.on('exit', this.handleCrash);
    }

    private processMessage = (message: Serializable) => {
        const stringMessage = message.toString().trim();
        const [id, type, ...data] = stringMessage.split('|');
        if (type === 'ready') {
            this.ready = true;
            if (this.log) console.log(`[${this.scriptPath}] Ready`);
            for (
                let i = 0; 
                i < (this.maxThreads < this.queue.length ? this.maxThreads : this.queue.length); 
                i++
            ) {
                const nextItem = this.queue.shift();
                this.runTask(...nextItem.args).then(nextItem.resolver);
            }
            return

        } else if (type === 'response') {
            const resolver = this.resolveMap[id];
            resolver([...data]);
            return;

        } else {
            console.log(stringMessage);
            return;

        }
    }

    private handleCrash = () => {
        this.ready = false;
        this.startPython();
    }

    private doRunTask = async (...args: string[]) => {
        this.threadCount++;
        const id = randomBytes(16).toString('hex');
        await this.writeToStream([id, ...args].join('|') + '\n');
        if (this.log) console.log(`[${id}][${this.scriptPath}] Started task with args: ${args.join()}`);
        const result = await new Promise<string[]>((resolve) => {
            this.resolveMap[id] = resolve;
        });
        this.threadCount--
        delete this.resolveMap[id];
        if (this.log) console.log(`[${id}][${this.scriptPath}] Task finshied with result: ${result.join()}`);
        return result;
    }

    private writeToStream = (
        chunk: string | Buffer | Uint8Array,
        encoding: BufferEncoding = 'utf8'
    ) => {
        return new Promise<void>((resolve, reject) => {
            const errorListener = (e: Error) => {
                this.process.stdin.removeListener('error', errorListener);
                reject(e);
            }
            this.process.stdin.on('error', errorListener);

            const successCallback = () => {
                this.process.stdin.removeListener('error', errorListener);
                resolve();
            }
            this.process.stdin.write(chunk, encoding, successCallback);
        });
    }

}

const connection = JSPython.Instance('./py-test.py');
const tasks = [
    connection.runTask('some data', 'more data'),
    connection.runTask('some more data', 'some more more data'),
    connection.runTask('other data', 'some more other data')
];