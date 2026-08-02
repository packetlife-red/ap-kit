// 全ジェネレータの読み込み口。
// import した順に registry へ並ぶので、ここの順序がUIの分野一覧の順序になる。

import './reliability.js';
import './queue.js';
import './cache.js';
import './cpu.js';
import './transfer.js';
import './subnet.js';
import './radix.js';
import './pert.js';
import './disk.js';
import './coding.js';
import './probability.js';
import './os.js';
import './evm.js';
import './finance.js';

export { allGenerators, getGenerator, generate } from '../genkit.js';
