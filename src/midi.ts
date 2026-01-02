import Stream from 'stream'
import { EventEmitter } from 'events'
import pkgPrebuilds from 'pkg-prebuilds'

// @ts-expect-error No types
// eslint-disable-next-line n/no-missing-import
import bindingOptions from '../binding-options.js'

// Bring in the set of constants to reflect MIDI messages and their
// parameters, to eliminate the need for magic numbers.
/** An instrument list, only valid in the General MIDI standard */
import { Instruments } from './instruments.js'
/** A drum map, only valid in the General MIDI standard */
import { Drums } from './drums.js'
/** Note descriptions, with Middle C = C5 = MIDI note 60 */
import { Notes } from './notes.js'
/** Message names, including CCs */
import { Messages } from './messages.js'

const midi = pkgPrebuilds(__dirname, bindingOptions)

/**
 * An array of numbers corresponding to the MIDI bytes: [status, data1, data2].
 * See https://www.cs.cf.ac.uk/Dave/Multimedia/node158.html for more info.
 */
export type MidiMessage = number[]
/** @deprecated */
export type MidiCallback = (deltaTime: number, message: MidiMessage) => void

export type MidiInputEvents = {
	message: [deltaTime: number, message: MidiMessage]
	messageBuffer: [deltaTime: number, message: Buffer]
}

export class Input extends EventEmitter<MidiInputEvents> {
	readonly #input: any

	constructor() {
		super()

		this.#input = new midi.Input((deltaTime: number, message: Buffer) => {
			this.emit('messageBuffer', deltaTime, message)
			this.emit('message', deltaTime, Array.from(message.values()))
		})
	}

	static getPortNames(): string[] {
		return midi.getInputPortNames()
	}

	closePort(): void {
		return this.#input.closePort()
	}
	destroy(): void {
		return this.#input.destroy()
	}
	getPortCount(): number {
		return this.#input.getPortCount()
	}
	getPortName(port: number): string {
		return this.#input.getPortName(port)
	}
	isPortOpen(): boolean {
		return this.#input.isPortOpen()
	}
	ignoreTypes(sysex: boolean, timing: boolean, activeSensing: boolean): void {
		return this.#input.ignoreTypes(sysex, timing, activeSensing)
	}
	openPort(port: number): void {
		return this.#input.openPort(port)
	}
	openPortByName(name: string): void {
		for (let port = 0; port < this.#input.getPortCount(); ++port) {
			if (name === this.#input.getPortName(port)) {
				return this.#input.openPort(port)
			}
		}
		return undefined
	}
	openVirtualPort(port: string): void {
		return this.#input.openVirtualPort(port)
	}
	setBufferSize(size: number, count = 4): void {
		return this.#input.setBufferSize(size, count)
	}
}

export class Output {
	readonly #output: any

	constructor() {
		this.#output = new midi.Output()
	}

	static getPortNames(): string[] {
		return midi.getOutputPortNames()
	}

	closePort(): void {
		return this.#output.closePort()
	}
	destroy(): void {
		return this.#output.destroy()
	}
	getPortCount(): number {
		return this.#output.getPortCount()
	}
	getPortName(port: number): string {
		return this.#output.getPortName(port)
	}
	isPortOpen(): boolean {
		return this.#output.isPortOpen()
	}
	openPort(port: number): void {
		return this.#output.openPort(port)
	}
	openPortByName(name: string): void {
		for (let port = 0; port < this.#output.getPortCount(); ++port) {
			if (name === this.#output.getPortName(port)) {
				return this.#output.openPort(port)
			}
		}
		return undefined
	}
	openVirtualPort(port: string): void {
		return this.#output.openVirtualPort(port)
	}
	send(message: number[] | Buffer): void {
		return this.sendMessage(message)
	}
	sendMessage(message: number[] | Buffer): void {
		if (Array.isArray(message)) {
			message = Buffer.from(message)
		}
		if (!Buffer.isBuffer(message)) {
			throw new Error('First argument must be an array or Buffer')
		}

		return this.#output.sendMessage(message)
	}
}

export function createReadStream(input?: Input): Stream {
	input = input || new Input()
	const stream = new Stream()
	stream.readable = true
	stream.paused = false
	stream.queue = []

	input.on('messageBuffer', function (_deltaTime, packet) {
		if (!stream.paused) {
			stream.emit('data', packet)
		} else {
			stream.queue.push(packet)
		}
	})

	stream.pause = function () {
		stream.paused = true
	}

	stream.resume = function () {
		stream.paused = false
		while (stream.queue.length && stream.emit('data', stream.queue.shift())) {}
	}

	return stream
}

export function createWriteStream(output?: Output): Stream {
	output = output || new Output()
	const stream = new Stream()
	stream.writable = true
	stream.paused = false
	stream.queue = []

	stream.write = function (d) {
		if (Buffer.isBuffer(d)) {
			d = Array.prototype.slice.call(d, 0)
		}

		output.sendMessage(d)

		return !this.paused
	}

	stream.end = function (buf) {
		if (buf) stream.write(buf)
		stream.writable = false
	}

	stream.destroy = function () {
		stream.writable = false
	}

	return stream
}

export const Constants = {
	Instruments,
	Drums,
	Notes,
	Messages,
}

/** @deprecated */
export const input = Input
/** @deprecated */
export const output = Output
