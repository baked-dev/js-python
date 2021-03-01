import sys
import time
import random
import json
import string
from threading import Thread

class Task(Thread):
    def __init__(self, group=None, target=None, name=None, args=(), kwargs=None):
        super(Task, self).__init__(group=group, target=target, name=name)
        self.id = args[0]
        self.task = json.loads(kwargs[0])
        return

    def run(self):
        if self.task['command'] == 'test':
            return self.do_test()
        elif self.task['command'] == 'random':
            return self.do_random()
        return

    def do_test(self):
        time.sleep(self.task['args'][1])
        self.send_response({
            "result": self.task['args'][0]
        })

    def do_random(self):
        time.sleep(2)
        self.send_response({
            "result": ''.join(random.SystemRandom().choice(string.ascii_uppercase + string.digits) for _ in range(self.task['args'][0]))
        })

    def send_response(self, data):
        data_string = json.dumps(data) 
        print(f"{self.id}|1|{data_string}")
        sys.stdout.flush()
        return

def main():
    time.sleep(2)
    print('0|0')
    sys.stdout.flush()
    buff = ''
    while True:
        buff += sys.stdin.read(1)
        if buff.endswith('\n'):
            input = buff[:-1]
            buff = ''
            kwargs = input.strip().split('|')
            arg = kwargs.pop(0)
            t = Task(args=(arg,), kwargs=kwargs)
            t.start()
    return

if __name__ == '__main__':
    main()