// promise的三种状态
const promiseState = {
    'PENDING': 'pending',
    'FULFILLED': 'fulfilled',
    'REJECTED': 'rejected'
}

class MyPromise {

    /**
     * 创建一个Promise
     * @param {Function} executor 任务执行器，立即执行
     */
    constructor(executor) {
        this._state = promiseState.PENDING; // 状态
        this._value = undefined; // 数据
        // 在executor中执行resolve & reject,抽离为私有方法
        try {
            executor(this._resolve.bind(this), this._reject.bind(this));
        } catch (error) {
            this._reject(error);
        }
    }


    /**
     * 标记当前任务完成
     * @param {any} data 任务完成的相关数据
     */
    _resolve(data) {
        // 改变状态和数据
        this._changeState(promiseState.FULFILLED, data);
    }

    /**
     * 标记当前任务失败
     * @param {any} reason 任务失败的原因 
     */
    _reject(reason) {
        this._changeState(promiseState.REJECTED, reason)
    }

    /**
     * 更改任务的状态
     * @param {String} newState 新状态
     * @param {any} value 相关数据
     */
    _changeState(newState, value) {
        // 已经修改过状态
        if (this._state !== promiseState.PENDING) {
            return;
        }
        this._state = newState;
        this._value = value;
    }
}

const myPro = new MyPromise((resolve, reject) => {
    throw new Error(1)
})

console.log(myPro)