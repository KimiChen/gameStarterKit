/*
 Copyright (c) 2013-2016 Chukong Technologies Inc.
 Copyright (c) 2017-2023 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
const epsilon = 1e-4;
const rounded = (n) => Math.round(n * 1e4) * epsilon;
/** Offset grows towards the end of the content; position includes elastic displacement. */
export class ScrollMotion {
    constructor() {
        this.position = 0;
        this.max = 0;
        this.dragging = false;
        this.animating = false;
        this.options = {
            brake: 0.5,
            inertia: true,
            elastic: true,
            bounceDuration: 1,
        };
        this.previousTime = 0;
        this.samples = [];
        this.start = 0;
        this.delta = 0;
        this.duration = 0;
        this.elapsed = 0;
        this.braking = false;
        this.brakingStart = 0;
        this.wasOutside = false;
    }
    begin(position, max, now, options = {}) {
        this.stop();
        this.position = position;
        this.max = Math.max(0, max);
        this.dragging = true;
        this.previousTime = now;
        this.options = Object.assign({ brake: 0.5, inertia: true, elastic: true, bounceDuration: 1 }, options);
        this.options.brake = Math.max(0, Math.min(1, this.options.brake));
    }
    stop() {
        this.dragging = false;
        this.animating = false;
        this.samples.length = 0;
    }
    drag(delta, now) {
        if (!this.dragging || !Number.isFinite(delta))
            return 0;
        const old = this.position;
        let movement = this.max <= 0 ? 0 : delta;
        if (this.options.elastic && Math.abs(this.outside()) >= epsilon)
            movement *= 0.5;
        if (!this.options.elastic)
            movement = Math.max(0, Math.min(this.max, old + movement)) - old;
        this.position = rounded(old + movement);
        if (this.samples.length === 5)
            this.samples.shift();
        this.samples.push({ delta: movement, dt: Math.max(0, (now - this.previousTime) / 1000) });
        this.previousTime = now;
        return this.position - old;
    }
    release() {
        if (!this.dragging)
            return;
        this.dragging = false;
        if (this.bounce() || !this.options.inertia)
            return;
        const time = this.samples.reduce((sum, s) => sum + s.dt, 0);
        if (time <= 0 || time >= 0.5 || this.options.brake >= 1)
            return;
        const velocity = (this.samples.reduce((sum, s) => sum + s.delta, 0) * (1 - this.options.brake)) / time;
        if (Math.abs(velocity) < epsilon)
            return;
        const movement = velocity * 0.7, brake = this.options.brake;
        const attenuation = brake <= 0
            ? 1 - brake
            : (1 - brake) / (1 + this.max * 0.000014 + this.max * this.max * 0.000000008);
        let target = Math.sign(velocity) * this.max * (1 - brake) * attenuation;
        let factor = Math.abs(target / movement);
        if (brake > 0 && factor > 7) {
            factor = Math.sqrt(factor);
            target = movement * (factor + 1);
        }
        else
            target += movement;
        let duration = Math.sqrt(Math.sqrt(Math.abs(velocity) / 5));
        if (brake > 0 && factor > 3) {
            factor = 3;
            duration *= factor;
        }
        if (brake === 0 && factor > 1)
            duration *= factor;
        this.startAuto(target, duration);
    }
    advance(dt) {
        if (!this.animating || !Number.isFinite(dt) || dt < 0)
            return this.position;
        const outside = Math.abs(this.outside()) >= epsilon;
        if (!this.braking) {
            if (outside && !this.wasOutside) {
                this.wasOutside = true;
                this.braking = true;
                this.brakingStart = this.position;
            }
            else if (!outside)
                this.wasOutside = false;
        }
        const factor = this.braking ? 0.05 : 1;
        this.elapsed += dt / factor;
        const time = this.duration <= 0 ? 1 : Math.min(1, this.elapsed / this.duration);
        const percentage = 1 + (time - 1) ** 5;
        let next = this.start + this.delta * percentage;
        let ended = Math.abs(percentage - 1) <= epsilon;
        if (this.options.elastic) {
            if (this.braking)
                next = this.brakingStart + (next - this.brakingStart) * factor;
        }
        else if (next < 0 || next > this.max) {
            next = Math.max(0, Math.min(this.max, next));
            ended = true;
        }
        this.position = rounded(next);
        if (ended) {
            this.animating = false;
            this.bounce();
        }
        return this.position;
    }
    outside() {
        return this.position < 0
            ? -this.position
            : this.position > this.max
                ? this.max - this.position
                : 0;
    }
    bounce() {
        const amount = this.outside();
        if (!this.options.elastic || Math.abs(amount) < epsilon)
            return false;
        this.startAuto(amount, Math.max(0, this.options.bounceDuration));
        return true;
    }
    startAuto(delta, duration) {
        this.start = this.position;
        this.delta = delta;
        this.duration = duration;
        this.elapsed = 0;
        this.animating = true;
        this.braking = false;
        this.brakingStart = 0;
        this.wasOutside = Math.abs(this.outside()) >= epsilon;
    }
}
