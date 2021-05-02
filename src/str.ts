import { MAX_LITERAL } from './const'

export const strn = (a: number) => a.toString().padStart(5, ' ')
export const stra = (a: number) => `0x${a.toString(16).padStart(4, '0')}`
export const strv = (a: number) => a > MAX_LITERAL ? `R${a - 32768}` : stra(a)
export const strb = (a: number) => {
  const bin = a.toString(2).padStart(16, '0')
  const bin_1 = bin.slice(0, 4)
  const bin_2 = bin.slice(4, 8)
  const bin_3 = bin.slice(8, 12)
  const bin_4 = bin.slice(12)
  return `${bin_1} ${bin_2} ${bin_3} ${bin_4}`
}
