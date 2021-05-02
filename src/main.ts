import { readFileSync, unlinkSync, createWriteStream } from 'fs'
import { resolve } from 'path'

import { run, disassemble } from './vm'

const DEFAULT_BIN = resolve('./challenge.bin')

const runit = fname => {
  console.log('Running ' + fname)
  const image = readFileSync(fname)
  try {
    run(image)
  } catch (err) {
    console.log(err)
  }
}

const args = process.argv.slice(2)
if (args.length == 0) {
  runit(DEFAULT_BIN)
} else if (args.length == 1) {
  runit(resolve(args[0]))
} else if (args.length == 2) {
  if (args[0] == '-d') {
    const path = resolve(args[1])
    try {
      unlinkSync(path)
    } catch {
      // ignore
    }
    const asm = createWriteStream(path)
    asm.on('open', () => {
      const image = readFileSync(DEFAULT_BIN)
      try {
        disassemble(image, asm)
      } catch (err) {
        console.log(err)
      } finally {
        asm.end()
      }
    })
  }
}
