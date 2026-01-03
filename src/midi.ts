import Stream from 'stream'
import { EventEmitter } from 'events'
import pkgPrebuilds from 'pkg-prebuilds'
import path from 'path'

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

const midi = pkgPrebuilds(path.join(__dirname, '..'), bindingOptions)

/**
 * An array of numbers corresponding to the MIDI bytes: [status, data1, data2].
 * See https://www.cs.cf.ac.uk/Dave/Multimedia/node158.html for more info.
 */
export type MidiMessage = number[]
/** @deprecated */
export type MidiCallback = (deltaTime: number, message: MidiMessage) => void

export interface MidiEventInfo {
	channel: number
	deltaTime: number
}

export type MidiInputEvents = {
	message: [deltaTime: number, message: MidiMessage]
	messageBuffer: [deltaTime: number, message: Buffer]

	sysex: [bytes: Buffer]

	noteon: [note: number, velocity: number, info: MidiEventInfo]
	noteoff: [note: number, velocity: number, info: MidiEventInfo]
	cc: [param: number, value: number, info: MidiEventInfo]
}

export class Input extends EventEmitter<MidiInputEvents> {
	readonly #input: any

	#pendingSysexBuffer: Buffer | null = null

	constructor() {
		super()

		this.#input = new midi.Input((deltaTime: number, message: Buffer) => {
			this.emit('messageBuffer', deltaTime, message)
			this.emit('message', deltaTime, Array.from(message.values()))

			if (message.byteLength === 0) return
			const lastByte = message[message.byteLength - 1]

			// a long sysex can be sent in multiple chunks, depending on the RtMidi buffer size
			let proceed = true
			if (this.#pendingSysexBuffer && message.byteLength > 0) {
				// If first byte is valid midi (7bit data)
				if (message[0] < 0x80) {
					this.#pendingSysexBuffer = Buffer.concat([this.#pendingSysexBuffer, message])
					if (lastByte === 0xf7) {
						this.emit('sysex', this.#pendingSysexBuffer)
						this.#pendingSysexBuffer = null
					}
					proceed = false
				} else {
					// ignore invalid sysex messages
					this.#pendingSysexBuffer = null
				}
			}
			if (proceed) {
				// Sysex
				if (message[0] === 0xf0) {
					if (lastByte === 0xf7) {
						// Full
						this.emit('sysex', message)
					} else {
						// Partial
						this.#pendingSysexBuffer =
							// eslint-disable-next-line n/no-unsupported-features/node-builtins
							typeof Buffer.copyBytesFrom === 'function' ? Buffer.copyBytesFrom(message) : Buffer.concat([message]) // Clone buffer
					}
					return
				}

				const channel = message[0] & 0x0f
				const type = message[0] & 0xf0
				if (type === Messages.NOTE_ON) {
					this.emit('noteon', message[1], message[2], { channel, deltaTime })
				} else if (type === Messages.NOTE_OFF) {
					this.emit('noteoff', message[1], message[2], { channel, deltaTime })
				} else if (type === Messages.SET_PARAMETER) {
					this.emit('cc', message[1], message[2], { channel, deltaTime })
				} else {
					// Future: more message types
					//
					// const data = this.parseMessage(message)
					// if (data.type === 'sysex' && lastByte !== 0xf7) {
					// 	this.#pendingSysexBuffer = Buffer.copyBytesFrom(message) // Clone buffer
					// } else {
					// 	data.msg._type = data.type // easy access to message type
					// 	this.emit(data.type, data.msg)
					// 	if (data.type === 'mtc') {
					// 		this.parseMtc(data.msg)
					// 	}
					// }
				}
			}
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

export function createReadStream(input?: Input): Stream.Readable {
	input = input || new Input()

	const stream = new Stream.Readable({
		objectMode: true,
		read() {
			// Data is pushed from the messageBuffer event handler
		},
	})

	input.on('messageBuffer', (_deltaTime, packet) => {
		stream.push(packet)
	})

	return stream
}

export function createWriteStream(output?: Output): Stream.Writable {
	output = output || new Output()

	const stream = new Stream.Writable({
		objectMode: true,
		write(chunk: Buffer | number[], _encoding, callback) {
			if (!Buffer.isBuffer(chunk)) {
				chunk = Buffer.from(chunk)
			}
			output.sendMessage(chunk)
			callback()
		},
	})

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
