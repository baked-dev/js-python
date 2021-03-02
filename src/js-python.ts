import { ChildProcessWithoutNullStreams, Serializable, spawn } from "child_process";
import { randomBytes } from "crypto";

enum ProcessMessageType {
    READY = '0',
    RESULT = '1'
}

type ProcessMessage = [
    string,
    ProcessMessageType,
    ...string[]
]

type TKeyType = string | number;

type JSONStringifyable = {
    [key in TKeyType]: JSONStringifyable
} | string | number | boolean | null | JSONStringifyable[]

class JSPython<T extends JSONStringifyable, R extends JSONStringifyable> {

    private static instances: {
        [scriptPath: string]: JSPython<any, any>;
    } = {};

    public static Instance<T extends JSONStringifyable, R extends JSONStringifyable>(scriptPath: string, maxThreads: number = 2): JSPython<T, R> {
        return this.instances[scriptPath] || (this.instances[scriptPath] = new this<T, R>(scriptPath, maxThreads));
    }

    private log: boolean = true;
    private process: ChildProcessWithoutNullStreams;
    private queue: {
        task: T,
        resolver: (result: R) => void;
    }[] = [];
    private ready: boolean = false;
    private resolveMap: {
        [key: string]: (result: R) => void;
    } = {};
    private threadCount = 0;

    private constructor (private scriptPath: string, public maxThreads: number = 2) {
        this.startPython();
    }

    public runTask = async (task: T) => {
        if (this.threadCount >= this.maxThreads || !this.ready){
            return await new Promise<R>((resolve) => {
                this.queue.push({
                    task,
                    resolver: resolve
                });
            });
        } else {
            const result = await this.doRunTask(task);
            if (this.queue.length > 0) {
                const nextItem = this.queue.shift();
                this.runTask(nextItem.task).then(nextItem.resolver);
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
        const [id, type, data] = stringMessage.split('|') as ProcessMessage;
        if (type === ProcessMessageType.READY) {
            this.ready = true;
            if (this.log) console.log(`[${this.scriptPath}] Ready`);
            for (
                let i = 0; 
                i < (this.maxThreads < this.queue.length ? this.maxThreads : this.queue.length); 
                i++
            ) {
                const nextItem = this.queue.shift();
                this.runTask(nextItem.task).then(nextItem.resolver);
            }
            return

        } else if (type === ProcessMessageType.RESULT) {
            const resolver = this.resolveMap[id];
            resolver(JSON.parse(data));
            return;

        } else {
            console.log(stringMessage);
            return;

        }
    }

    private handleCrash = (code: number) => {
        if (code !== 1) {
            this.ready = false;
            this.startPython();
        }
    }

    private doRunTask = async (task: T) => {
        this.threadCount++;
        const id = randomBytes(16).toString('hex');
        await this.writeToStream([id, JSON.stringify(task)].join('|') + '\n');
        if (this.log) console.log(`[${id}][${this.scriptPath}] Started task with args: ${JSON.stringify(task)}`);
        const result = await new Promise<R>((resolve) => {
            this.resolveMap[id] = resolve;
        });
        this.threadCount--
        delete this.resolveMap[id];
        if (this.log) console.log(`[${id}][${this.scriptPath}] Task finshied with result: ${JSON.stringify(result)}`);
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

type ExampleMessage = {
    command: string,
    args: JSONStringifyable[]
}

type ExampleResult = {
    result: string;
}

const example = JSPython.Instance<ExampleMessage, ExampleResult>('./py-example.py');

// this is now typed through the generic type
example.runTask({
    command: 'test',
    args: ['hello', 1]
});
example.runTask({
    command: 'random',
    args: [12]
});
example.runTask({
    command: 'test',
    args: ['hello back', 2]
});
example.runTask({
    command: 'random',
    args: [4]
}).then((res) => {
    // this is now typed too
    console.log(res.result);
});
