/**
 * 运行一个微队列任务
 * 把传递的函数放到微队列中
 * @param {Function} callback
 */
function runMicroTask(callback) {
    // 判断node环境
    // 为了避免「变量未定义」的错误，这里最好加上前缀globalThis
    // globalThis是一个关键字，指代全局对象，浏览器环境为window，node环境为global
    if (globalThis.process && globalThis.process.nextTick) {
        process.nextTick(callback);
    } else if (globalThis.MutationObserver) {
        const p = document.createElement('p');
        const observer = new MutationObserver(callback);
        observer.observe(p, {
            childList: true, // 观察该元素内部的变化
        });
        p.innerHTML = '1';
    } else {
        setTimeout(callback, 0);
    }
}

/**
 * 判断一个数据是否是promise对象
 * @param {any} obj 
 * @returns 
 */
function isPromise(obj) {
    // 存在、对象、有then方法
    return !!(obj && typeof obj === 'object' && typeof obj.then === 'function');
}

class MyPromise {
    // promise的三种状态
    static PENDING = 'pending';
    static FULFILLED = 'fulfilled';
    static REJECTED = 'rejected';

    /**
     * 创建一个Promise
     * @param {Function} executor 任务执行器，立即执行
     */
    constructor(executor) {
        this._state = MyPromise.PENDING; // 状态
        this._value = undefined; // 数据
        this._handlers = []; // 处理函数的队列
        // 在executor中执行resolve & reject,抽离为私有方法
        try {
            executor(this._resolve.bind(this), this._reject.bind(this));
        } catch (error) {
            this._reject(error);
            // 需要合理的报错
            console.error(error);
        }
    }

    /**
     * 向处理队列中添加一个函数
     * @param {Function} executor 添加函数
     * @param {String} state 该函数什么状态下执行
     * @param {Function} resolve 让then函数返回的Promise成功
     * @param {Function} reject 让then函数返回的Promise失败
     */
    _pushHandler(executor, state, resolve, reject) {
        this._handlers.push({
            executor,
            state,
            resolve,
            reject
        })
    }

    /**
     * 根据实际情况，执行队列
     */
    _runHandlers() {
        // 目前任务在挂起
        if (this._state === MyPromise.PENDING) {
            return;
        }
        while (this._handlers[0]) {
            const handler = this._handlers[0];
            this._runOneHandler(handler)
            this._handlers.shift();
        }
    }

    /**
     * 处理一个handler
     */
    _runOneHandler({
        executor,
        state,
        resolve,
        reject
    }) {
        // 放到微队列中执行
        runMicroTask(() => {
            // 状态不一致不做处理
            if (this._state !== state) {
                return;
            }
            // 如果执行器不是一个有效的函数
            if (typeof executor !== 'function') {
                this._state === MyPromise.FULFILLED ? resolve(this._value) : reject(this._value);
                return;
            }
            // 有效的执行器：返回一般数据、返回promise
            try {
                const result = executor(this._value);
                if (isPromise(result)) {
                    result.then(resolve, reject);
                } else {
                    resolve(result);
                }
            } catch (error) {
                reject(error);
                console.error(error);
            }
        })
    }

    /**
     * Promise A+规范的then
     * @param {Function} onFulfilled  状态成功时的执行
     * @param {Function} onRejected 状态失败时的执行
     */
    then(onFulfilled, onRejected) {
        return new MyPromise((resolve, reject) => {
            // 注意这里的resolve、reject就是_resolve、_reject
            this._pushHandler(onFulfilled, MyPromise.FULFILLED, resolve, reject);
            this._pushHandler(onRejected, MyPromise.REJECTED, resolve, reject);
            this._runHandlers(); // 执行队列
        });
    }

    /**
     * 仅处理失败的场景
     * @param {Function} onRejected 
     */
    catch (onRejected) {
        // 返回的还是一个promise并且只执行失败的场景
        return this.then(null, onRejected);
    }

    /**
     * 无论成功或失败都会执行的回调
     * @param {Function} onSettled 
     */
    finally(onSettled) {
        // 返回的还是一个promise,成功和失败都不改变状态
        // 出现错误的时候改变,then中实现了异常的处理
        return this.then((data) => {
            onSettled()
            return data;
        }, (reason) => {
            onSettled()
            throw reason;
        })
    }


    /**
     * 标记当前任务完成
     * @param {any} data 任务完成的相关数据
     */
    _resolve(data) {
        // 改变状态和数据
        this._changeState(MyPromise.FULFILLED, data);
    }

    /**
     * 标记当前任务失败
     * @param {any} reason 任务失败的原因 
     */
    _reject(reason) {
        this._changeState(MyPromise.REJECTED, reason)
    }

    /**
     * 更改任务的状态
     * @param {String} newState 新状态
     * @param {any} value 相关数据
     */
    _changeState(newState, value) {
        // 已经修改过状态
        if (this._state !== MyPromise.PENDING) {
            return;
        }
        this._state = newState;
        this._value = value;
        this._runHandlers()
    }

    /**
     * 返回一个已完成的promise
     * 特殊情况：
     * 1. 传递的data本身就是es6的promise对象
     * 2. 传递的data是promiseLike（实现了promiseA+规范），返回新的promise状态和其一样
     * @param {any} data 
     */
    static resolve(data) {
        if (data instanceof MyPromise) {
            return data;
        }
        return new MyPromise((resolve, reject) => {
            if (isPromise(data)) {
                data.then(resolve, reject);
            } else {
                resolve(data)
            }
        })

    }

    /** 
     * 得到一个被拒绝的promise
     * @param {any} reason
     */
    static reject(reason) {
        return new MyPromise((resolve, reject) => {
            reject(reason)
        })
    }

    /**
     * 得到一个新的promise,该promise的状态取决于
     * proms的执行，proms是一个迭代器，包含多个Promise
     * 全部Promise成功则返回的Promise成功，数据为所有
     * Promise成功的数据，并且顺序是按照传入的顺序排列
     * 失败则是返回第一个promise失败的原因
     * @param {iterator} params 
     */
    static all(proms) {
        return new MyPromise((resolve, reject) => {
            try {
                // 注意需要保持顺序，迭代器可能没有length
                const results = []; // 接收成功后的结果
                // 保证promise的有序，如何知道所有的promise都完成了
                let count = 0; // promise的计数，循环结束之后就是promise的总数
                // 循环是不会被promise阻塞的，js是不会阻塞的
                let fulfilledCount = 0; // 已完成的数量
                for (const prom of proms) {
                    let index = count; // 当前循环到的下标，只可以使用let不使用var
                    // var变量提升提升到外面每次都是同一个var在循环。
                    count++;
                    // prom的then表示之前的任务已完成，同时需要保证前面是一个promise,因为可能是数据
                    MyPromise.resolve(prom).then((data) => {
                        fulfilledCount++;
                        results[index] = data;
                        // 当前是最后一个promise完成
                        if (fulfilledCount === count) {
                            resolve()
                        }
                    }, reject) // reject只会调用一次保证最先调用的失败让all失败
                }
                // 空数组
                if (count === 0) {
                    resolve(results);
                }
            } catch (error) {
                // 在执行过程中报错
                reject(error);
                console.error(error);
            }
        })
    }

    /**
     * 等待所有promise有结果后
     * 该方法返回的promise完成
     * 并且按照顺序将所有的结果汇总
     * @param {iterator} proms 
     */
    static allSettled(proms) {
        const ps = [];
        for (const p of proms) {
            // 首先保证是一个promise
            // 无论成功还是失败到时候走两条路返回对应的值的promise都是成功的
            ps.push(MyPromise.resolve(p).then((value) => ({
                status: MyPromise.FULFILLED,
                value,
            }), (reason) => ({
                status: MyPromise.REJECTED,
                reason
            })))
        }
        return MyPromise.all(ps);
    }


    /**
     * 返回第一个有结果的promise,如果是空数组按照官方设计就是一直等待
     * @param {iterator} proms 
     */
    static race(proms) {
        // 虽然可能一次遍历有多个结果但是resolve、reject只会响应一次同时当前的
        // promise的状态是不会更改的。
        return new MyPromise((resolve, reject) => {
            for (const p of proms) {
                MyPromise.resolve(p).then(resolve, reject);
            }
        })
    }


    /**
     * 返回第一个成功的promise,如果都失败返回错误的集合
     * @param {iterator} proms 
     */
    static any(proms) {
        return new MyPromise((resolve, reject) => {
            let count = 0;
            let rejectCount = 0;
            const rejectPs = [];
            for (const p of proms) {
                let index = count;
                count++;
                MyPromise.resolve(p).then((data) => {
                    resolve(data);
                }, (reason) => {
                    rejectCount++;
                    rejectPs[index] = reason
                    if (rejectCount === count) {
                        reject(rejectPs);
                    }
                })
            }
            if (count === 0) {
                reject(proms);
            }
        })
    }

}

const myPro = new MyPromise((resolve, reject) => {
    reject(1)
})

setTimeout(() => {
    MyPromise.any([MyPromise.reject(2), myPro]).then((data) => {
        console.log(data)
    }, (reason) => {
        console.log(reason)
    });
}, 1000)


// myPro.then(() => {
//     console.log(1);
// })
// console.log(myPro)

// 测试1：promise互操作
// const pro1 = new MyPromise((resolve, reject) => {
//     resolve(1);
// });

// pro1.then((data) => {
//     console.log(data);
//     return new Promise((resolve) => {
//         resolve(2);
//     })
// }).then((data) => {
//     console.log(data)
// })

// 测试2：使用async关键字
// function delay(duration) {
//     return new MyPromise((resolve) => {
//         setTimeout(() => {
//             resolve()
//         }, duration);
//     })
// }

// (async function () {
//     console.log('start');
//     await delay(2000);
//     console.log('end');
// })()

// 直接使用promise实现
// Promise.prototype.catch = function (onRejected) {
//     return this.then(null, onRejected);
// }

// Promise.prototype.finally = function (onSettled) {
//     return this.then((data) => {
//         onSettled();
//         return data;
//     }, (reason) => {
//         onSettled();
//         throw reason;
//     })
// }