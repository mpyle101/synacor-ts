#!/usr/bin/env python3

import argparse, array, binascii, struct, sys
from collections import namedtuple
from inspect import signature

Operation = namedtuple('Operation', 'name argc')
OPCODES = [
    'halt', 'set', 'push', 'pop', 'eq', 'gt', 'jmp', 'jt', 'jf', 'add',
    'mult', 'mod', 'and', 'or', 'not', 'rmem', 'wmem', 'call', 'ret',
    'out', 'in', 'noop'
]

FILE_TYPE   = binascii.hexlify(b'gRuE')
MAX_LITERAL = 32768

class VM:

    def __init__(self, image):
        self.image = image

        self.ip = 0
        self.stack     = []
        self.reader    = None
        self.registers = [0] * 8

        self.opcodes = []
        for op in OPCODES:
            fn  = getattr(self, 'op_' + op)
            sig = signature(fn)
            self.opcodes.append(Operation(op, len(sig.parameters)))

        self.commands = {
            'setr': self.do_setr,
            'getr': self.do_getr,
            'quit': self.do_quit,
            'dump': self.do_dump,
            'load': self.do_load
        }


    # utility functions
    def getv(self, v):
        return v if v < MAX_LITERAL else self.registers[v - MAX_LITERAL]

    def setr(self, r, v):
        self.registers[r - MAX_LITERAL] = v

    # opcode handlers
    def op_halt(self):
        sys.exit()

    def op_set(self, a, b):
        self.setr(a, self.getv(b))

    def op_push(self, a):
        self.stack.append(self.getv(a))

    def op_pop(self, a):
        self.setr(a, self.stack.pop())

    def op_eq(self, a, b, c):
        self.setr(a, 1 if self.getv(b) == self.getv(c) else 0)

    def op_gt(self, a, b, c):
        self.setr(a, 1 if self.getv(b) > self.getv(c) else 0)

    def op_jmp(self, a):
        self.ip = a

    def op_jt(self, a, b):
        if self.getv(a) != 0: self.op_jmp(b)

    def op_jf(self, a, b):
        if self.getv(a) == 0: self.op_jmp(b)

    def op_add(self, a, b, c):
        self.setr(a, (self.getv(b) + self.getv(c)) % MAX_LITERAL)

    def op_mult(self, a, b, c):
        self.setr(a, (self.getv(b) * self.getv(c)) % MAX_LITERAL)

    def op_mod(self, a, b, c):
        self.setr(a, self.getv(b) % self.getv(c))

    def op_and(self, a, b, c):
        self.setr(a, self.getv(b) & self.getv(c))

    def op_or(self, a, b, c):
        self.setr(a, self.getv(b) | self.getv(c))

    def op_not(self, a, b):
        self.setr(a, (1 << 15) - 1 - self.getv(b))

    def op_rmem(self, a, b):
        self.setr(a, self.image[self.getv(b)])

    def op_wmem(self, a, b):
        self.image[self.getv(a)] = self.getv(b)

    def op_call(self, a):
        self.stack.append(self.ip)
        self.ip = self.getv(a)

    def op_ret(self):
        if len(self.stack):
            self.ip = self.stack.pop()
        else:
            self.op_halt()

    def op_out(self, a):
        print(chr(self.getv(a)), end='')

    def op_in(self, a):
        if self.reader is None:
            line = input()
            cmd, *args = line.split()
            if cmd in self.commands:
                self.commands[cmd](*args)
                print('done')
                return self.op_in(a)

            self.reader = (c for c in line)

        try:
            c = next(self.reader)
        except StopIteration:
            self.reader = None
            c = '\n'

        self.setr(a, ord(c))

    def op_noop(self):
        pass

    # command handling
    def do_setr(self, a, b):
        self.registers[int(a)] = int(b)

    def do_getr(self, a):
        print(self.registers[int(a)])

    def do_quit(self):
        sys.exit()

    def do_dump(self, fname):
        with open(fname, 'wb') as fp:
            fp.write(FILE_TYPE)
            fp.write(struct.pack('H', self.ip))
            fp.write(struct.pack('8H', *self.registers))
            fp.write(struct.pack('H', len(self.stack)))
            fp.write(struct.pack(f'{len(self.stack)}H', *self.stack))
            fp.write(self.image)

    def do_load(self, fname):
        with open(fname, 'rb') as fp:
            ftype = fp.read(8)
            if ftype == FILE_TYPE:
                self.ip = struct.unpack('H', fp.read(2))[0]
                self.registers = list(struct.unpack('8H', fp.read(16)))
                frms = struct.unpack('H', fp.read(2))[0]
                self.stack = list(struct.unpack(f'{frms}H', fp.read(2*frms)))
                self.image = array.array('H')
                self.image.frombytes(fp.read())
            else:
                print('Unknown file type')

    # execution
    def disassemble(self, fp):
        while self.ip != len(self.image):
            ip = self.ip
            op = self.image[self.ip]
            self.ip += 1

            try:
                opc  = self.opcodes[op]
                args = self.image[self.ip:self.ip + opc.argc]
                args = [v if v < MAX_LITERAL else f'reg{v - MAX_LITERAL}' for v in args]
                self.ip += opc.argc
                if opc.name == 'out':
                    if type(args[0]) == int:
                        if args[0] == 10:
                            args = [(f"{args[0]:<6}'\\n'")]
                        else:
                            args = [(f"{args[0]:<6}'{chr(args[0])}'")]

                fp.write(f'{ip:0>5}   {opc.name:7}{" ".join(map(str, args))}\n')
            except IndexError:
                fp.write(f'{ip:0>5}   DATA   {op}\n')


    def run(self):
        while self.ip != len(self.image):
            op = self.image[self.ip]
            self.ip += 1

            try:
                op = self.opcodes[op]
                fn = getattr(self, 'op_' + op.name)
            except (IndexError, AttributeError):
                raise NotImplementedError(f'Opcode not found: {op}')

            args = self.image[self.ip:self.ip + op.argc]
            self.ip += op.argc

            fn(*args)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('infile')
    parser.add_argument('-d', '--disassemble', help='disassemble to file')
    args = parser.parse_args()

    with open(args.infile, 'rb') as fp:
        image = array.array('H')
        image.frombytes(fp.read())
        vm = VM(image)

        try:
            if args.disassemble:
                with open(args.disassemble, 'w') as f:
                    vm.disassemble(f)
            else:
                vm.run()
        except KeyboardInterrupt:
            sys.exit(1)

    
if __name__ == '__main__':
    main()
