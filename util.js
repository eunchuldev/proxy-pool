const EventEmitter = require('events');
const Queue = require("denque");
const PriorityQueue = require("tinyqueue");
class DefaultDict {
  constructor(defaultInit) {
    return new Proxy({}, {
      get: (target, name) => name in target ?
      target[name] :
      (target[name] = typeof defaultInit === 'function' ?
        new defaultInit().valueOf() :
        defaultInit)
    })
  }
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class AsyncPriorityQueue {
  constructor(...args){
    this.q = new PriorityQueue(...args);
    this.resolverQ = new Queue();
  }
  push(val) {
    let resolver = this.resolverQ.shift();
    if(resolver !== undefined)
      resolver(val);
    else
      this.q.push(val)
  }
  async pop() {
    let next = this.q.pop();
    if(next !== undefined)
      return next;
    else
      return new Promise(resolver => this.resolverQ.push(resolver));
  }
  peek() {
    return this.q.peek();
  }
  iterator() {
    // monkey patch
    return this.q.data;
  }
  remove(pos) {
    // monkey patch
    let target = this.q.data[pos];
    let bottom = this.q.data.pop()
    if(--this.q.length > 0){
      this.q.data[pos] = bottom;
      this.q._down(pos);
    }
    return target;
  }
}

module.exports = {
  DefaultDict,
  sleep,
  AsyncPriorityQueue,
}
