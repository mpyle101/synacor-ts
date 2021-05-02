from enum import IntEnum
from itertools import permutations

class Coins(IntEnum):
    RED      = 2
    CORRODED = 3
    SHINY    = 5
    CONCAVE  = 7
    BLUE     = 9

def fn(a, b, c, d, e):
    return a + b * c**2 + d**3 - e


for p in permutations(map(int, Coins)):
    if fn(*p) == 399:
        for c in p:
            print(Coins(c))
