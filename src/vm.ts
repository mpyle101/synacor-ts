import { createWriteStream } from 'fs'

import { MAX_LITERAL, MEMORY_SIZE, MAX_ADDRESS } from './const'
import { getc, putc, puts } from './io'
import { stra, strb, strn, strv } from './str'

type WriteStream = ReturnType<typeof createWriteStream>

export const run = async (image: Buffer) => {
  const vm = create_vm(image)
  while (vm.ready()) {
    const op = vm.getop(vm.nexti())
    await op.exec(vm.args(op))
  }
}

export const disassemble = (
  image: Buffer,
  fp: WriteStream
) => {
  const vm = create_vm(image)
  while (vm.getip() < MAX_ADDRESS) {
    const ips = stra(vm.getip())
    const opc = vm.nexti()
    try {
      const op  = vm.getop(opc)
      const asm = op.asm(vm.args(op))
      fp.write(`${ips}   ${asm}\n`)
    } catch {
      /* DATA: <ip>   <hex> (<dec>, <bits>) */
      fp.write(`${ips}   ${stra(opc)} (${strn(opc)}, ${strb(opc)})\n`)
    }
  }
}

const create_op = (
  code: number,
  name: string,
  argc: number,
  fn: (...args: number[]) => void,
  fa: (...args: number[]) => string
) => {
  const asm = (argv) => fa(...argv)
  const exec = (argv) => fn(...argv)

  return {
    exec, asm, code, name, argc
  }
}

const create_vm = (image: Buffer) => {
  let ip = 0
  const stack: number[] = []
  const memory = Buffer.alloc(MEMORY_SIZE, 0xde)
  const registers: number[] = new Array(8).fill(0)

  image.copy(memory)

  const nexti = () => {
    const v = reada(ip)
    ip += 1
    return v
  }

  const args = op => {
    const args: number[] = []
    for (let i = 0; i < op.argc; i += 1) {
      args.push(nexti())
    }
    return args
  }

  const error  = (m: string) => { throw new Error(m) }
  const reada  = (a: number) => memory.readUInt16LE(a * 2)
  const getr   = (a: number) => registers[a - 32768]
  const getv   = (v: number) => v > MAX_LITERAL ? getr(v) : v
  const jump   = (a: number) => ip = getv(a)
  const writea = (a: number, v: number) => memory.writeUInt16LE(v, a * 2)
  const setr   = (a: number, v: number) => registers[a - 32768] = v
  const setv   = (a: number, v: number) => a > MAX_LITERAL ? setr(a, v) : writea(getv(a), v)

  /** Op codes */
  const ops = new Map([
      create_op(0, 'halt', 0,
        () => ip = undefined!,
        () => 'HALT\n'
      ),
      create_op(1, 'set', 2,
        (a, b) => setr(a, getv(b)),
        (a, b) => `SET ${strv(a)}, ${strv(b)}`
      ),
      create_op(2, 'push', 1,
        a => stack.push(getv(a)),
        a => `PUSH ${strv(a)}`
      ),
      create_op(3, 'pop', 1,
        a => {
          const v = stack.pop()
          v != undefined ? setv(a, getv(v)) : error('Stack empty')
        },
        a => `POP ${strv(a)}`
      ),
      create_op(4, 'eq', 3,
        (a, b, c) => setv(a, getv(b) == getv(c) ? 1 : 0),
        (a, b, c) => `SET ${strv(a)} = (${strv(b)} == ${strv(c)}) ? 1 : 0`
      ),
      create_op(5, 'gt', 3,
        (a, b, c) => setv(a, getv(b) > getv(c) ? 1 : 0),
        (a, b, c) => `SET ${strv(a)} = (${strv(b)} > ${strv(c)}) ? 1 : 0`
      ),
      create_op(6, 'jmp', 1,
        a => jump(a),
        a => `JMP ${stra(a)}`
      ),
      create_op(7, 'jt', 2,
        (a, b) => getv(a) && jump(b),
        (a, b) => `IF ${strv(a)} != 0, JMP ${stra(b)}`
      ),
      create_op(8, 'jf', 2,
        (a, b) => getv(a) || jump(b),
        (a, b) => `IF ${strv(a)} == 0, JMP ${stra(b)}`
      ),
      create_op(9, 'add', 3,
        (a, b, c) => setv(a, (getv(b) + getv(c)) % 32768),
        (a, b, c) => `${strv(a)} = ${strv(b)} + ${strv(c)} (% 32768)`
      ),
      create_op(10, 'mult', 3,
        (a, b, c) => setv(a, (getv(b) * getv(c)) % 32768),
        (a, b, c) => `${strv(a)} = ${strv(b)} * ${strv(c)} (% 32768)`
      ),
      create_op(11, 'mod', 3,
        (a, b, c) => setv(a, getv(b) % getv(c)),
        (a, b, c) => `${strv(a)} = ${strv(b)} % ${strv(c)}`
      ),
      create_op(12, 'and', 3,
        (a, b, c) => setv(a, getv(b) & getv(c)),
        (a, b, c) => `${strv(a)} = (${strv(b)} & ${strv(c)})`
      ),
      create_op(13, 'or', 3,
        (a, b, c) => setv(a, getv(b) | getv(c)),
        (a, b, c) => `${strv(a)} = (${strv(b)} | ${strv(c)})`
      ),
      create_op(14, 'not', 2,
        (a, b) => setv(a, (1 << 15) - 1 - getv(b)),
        (a, b) => `${strv(a)} = ~${strv(b)}`
      ),
      create_op(15, 'rmem', 2,
        (a, b) => setr(a, reada(getv(b))),
        (a, b) => `${strv(a)} = [${strv(b)}]`
      ),
      create_op(16, 'wmem', 2,
        (a, b) => writea(getv(a), getv(b)),
        (a, b) => `[${strv(a)}] = ${strv(b)}`
      ),
      create_op(17, 'call', 1,
        a => { stack.push(ip); jump(a) },
        a => `CALL ${stra(a)}`
      ),
      create_op(18, 'ret', 0,
        () => ip = stack.pop()!,
        () => 'RET\n'
      ),
      create_op(19, 'out', 1,
        a => putc(getv(a)),
        a => `OUT  ${a == 10 ? '\\n' : a > MAX_LITERAL ? strv(a) : String.fromCharCode(a)}`
      ),
      create_op(20, 'in', 1,
        async a => setv(a, await getc(cmds)),
        a => `IN ${strv(a)}`
      ),
      create_op(21, 'noop', 0,
        () => {},
        () => 'NOOP'
      )
    ].map(op => [op.code, op])
  )

  /** Commands */
  const do_quit = () => ip = undefined!
  const do_getr = args => {
    registers.forEach((r, i) => puts(`R${i}  ${stra(r)}\n`))
    puts('\n')
  }
  const cmds = new Map([
    ['quit', do_quit],
    ['getr', do_getr]
  ])

  return {
    args,
    nexti,
    getip: () => ip,
    getop: opc => ops.get(opc) || error(`Unknown op code: ${opc}`),
    ready: () => ip != undefined
  }
}

