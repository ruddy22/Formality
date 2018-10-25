import base

-- TEST VALUES

-- The natural number 20
let n S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-succ(S-zero))))))))))))))))))))

-- A string of 32 bits, all zeroes
let zero S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-0(S-z)))))))))))))))))))))))))))))))) 

-- A list with 1000 strings of 32 bits, all zeroes
let list
  S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, 
  S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, 
  S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, 
  S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, 
  S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, 
  S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, 
  S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, 
  S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, 
  S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, 
  S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, S-cons(zero, 
    S-nil))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))

-- MAIN

-- Maps `inc` 2^20 times to `list`; in total, `inc` is applied 2^20*1000 = 1,048,576,000 = about 1 billion times
let main
  S-List-to-List(
  apply-pow2n-times(n, map(inc), list))
