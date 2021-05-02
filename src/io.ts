import { createInterface } from 'readline'

let in_ptr = 0
let in_buf: string | null = null

const readline = (): Promise<string> =>
  new Promise(resolve => {
    const reader = createInterface({ input: process.stdin })
    reader.question('', input => { reader.close(); resolve(input) })
  })

export const puts = (s: string) => process.stdout.write(s)
export const putc = (v: number) => puts(String.fromCharCode(v))
export const getc = async cmds => {
  if (in_buf == null) {
    in_ptr = 0
    in_buf = await readline()
    if (in_buf === 'quit') {
      cmds.get('quit')()
      return 10
    } else if (in_buf.startsWith('!')) {
      const argv = in_buf.slice(1).split(' ')
      const cmd = cmds.get(argv[0])
      cmd ? cmd(argv.slice(1)) : console.log(`Unknown command: ${argv[0]}`)
      in_buf = null
      return getc(cmds)
    }
  }
  let c: number
  if (in_ptr < in_buf.length) {
    c = in_buf[in_ptr].charCodeAt(0)
    in_ptr += 1
  } else {
    in_ptr = 0
    in_buf = null
    c = 10
  }
  return c
}
