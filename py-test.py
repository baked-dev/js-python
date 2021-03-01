import sys
import time
from threading import Thread

class Task(Thread):
    def __init__(self, group=None, target=None, name=None, args=(), kwargs=None):
        super(Task, self).__init__(group=group, target=target, name=name)
        self.args = args
        self.id = args[0]
        self.kwargs = kwargs
        return

    def run(self):
        time.sleep(2)
        self.send_response(data=['pong', self.kwargs[1]])
        return

    def send_response(self, data):
        data_string = "|".join(data) 
        print(f"{self.id}|response|{data_string}")
        sys.stdout.flush()
        return

def main():
    try:
        time.sleep(2)
        print('0|ready|')
        sys.stdout.flush()
        buff = ''
        i = 0
        while True:
            buff += sys.stdin.read(1)
            if buff.endswith('\n'):
                input = buff[:-1]
                buff = ''
                kwargs = input.strip().split('|')
                arg = kwargs.pop(0)
                t = Task(args=(arg,), kwargs=kwargs)
                t.start()
                i = i + 1

    except KeyboardInterrupt:
        sys.stdout.flush()
        pass

    return

if __name__ == '__main__':
    main()