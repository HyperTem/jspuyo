'use strict';

const { Cpu } = require('./Cpu.js');
const { CpuGame } = require('./CpuGame.js');
const { Settings } = require('./Utils.js');

const roomIds = new Set();		// Set of roomIds currently in use
const roomIdToRoom = new Map();
const idToRoomId = new Map();

const MAX_FRAME_DIFFERENCE = 20;

class Room {
	constructor(members, host, roomSize, settingsString, roomType = 'default') {
		this.roomId = generateRoomId(6);
		this.members = members;
		this.cpus = new Map();
		this.numCpus = 0;
		this.games = new Map();

		this.roomSize = roomSize;
		this.settingsString = settingsString;
		this.roomType = roomType;
		this.quickPlayTimer = null;		// Only used if roomType is 'ffa'

		this.ingame = false;
		this.host = host;
		this.paused = [];
		this.spectating = new Map();
		this.defeated = [];
		this.timeout = null;

		switch(this.roomType) {
			case 'ffa':
				Room.defaultQueueRoomId = this.roomId;
				break;
			case 'ranked':
				Room.rankedRoomId = this.roomId;
				break;
		}

		this.members.forEach((player, gameId) => {
			idToRoomId.set(gameId, this.roomId);

			// Send update to all players
			player.socket.emit(
				'roomUpdate',
				this.roomId,
				Array.from(this.members.keys()),
				this.roomSize,
				this.settingsString,
				this.roomType,
				gameId === this.host,
				false		// Not spectating
			);

			player.socket.join(this.roomId);
		});

		console.log(`Creating room ${this.roomId} with gameIds: ${JSON.stringify(Array.from(this.members.keys()))}`);
	}

	/**
	 * Sets new settings of the room.
	 */
	changeSettings(settingsString, roomSize) {
		this.settingsString = settingsString;
		this.roomSize = roomSize;
	}

	/**
	 * Adds a player/CPU to an existing room.
	 */
	join(gameId, socket, cpuInfo = null) {
		// Room is full or ingame
		if((this.members.size === this.roomSize && cpuInfo === null) || this.ingame) {
			this.spectate(gameId, socket);
			return;
		}

		// Spectators require much less work to join actively
		if(this.spectating.has(gameId)) {
			this.spectating.delete(gameId);
		}
		else {
			socket.join(this.roomId);
			idToRoomId.set(gameId, this.roomId);
		}

		// Determine if adding a CPU or player
		if(cpuInfo === null) {
			this.members.set(gameId, { socket });
		}
		else {
			this.cpus.set(gameId, cpuInfo);
		}
		console.log(`Added gameId ${gameId} to room ${this.roomId}`);

		this.members.forEach((player, id) => {
			player.socket.emit(
				'roomUpdate',
				this.roomId,
				Array.from(this.members.keys()).concat(Array.from(this.cpus.keys())),
				this.roomSize,
				this.settingsString,
				this.roomType,
				id === this.host,
				false		// Not spectating
			);
		});

		this.spectating.forEach(spectatorSocket => {
			spectatorSocket.emit(
				'roomUpdate',
				this.roomId,
				Array.from(this.members.keys()).concat(Array.from(this.cpus.keys())),
				this.roomSize,
				this.settingsString,
				this.roomType,
				false,		// Not host
				true		// Spectating
			);
		});
	}

	/**
	 * Spectates a room (receives player data but does not play).
	 */
	spectate(gameId, socket) {
		if(this.members.has(gameId)) {
			this.leave(gameId, true, true);
		}
		else {
			// Need to separate socket join since leaving (and re-joining) is extremely slow
			socket.join(this.roomId);
		}

		idToRoomId.set(gameId, this.roomId);

		this.spectating.set(gameId, socket);
		socket.emit(
			'roomUpdate',
			this.roomId,
			Array.from(this.members.keys()).concat(Array.from(this.cpus.keys())),
			this.roomSize,
			this.settingsString,
			this.roomType,
			false,		// Not host
			true 		// Spectating
		);
		console.log(`Added gameId ${gameId} to room ${this.roomId} as a spectator`);
	}

	/**
	 * Starts a room by generating necessary CPU games and sending a 'start' event to all sockets in the room.
	 */
	start() {
		const allIds = Array.from(this.members.keys()).concat(Array.from(this.cpus.keys()));
		const settings = Settings.fromString(this.settingsString);

		// Generate the CPU games
		this.cpus.forEach((cpu, cpuId) => {
			const { client_socket, socket, speed, ai } = cpu;
			const opponentIds = allIds.filter(id => id !== cpuId);

			const game = new CpuGame(
				cpuId,
				opponentIds,
				client_socket,
				Cpu.fromString(ai, settings),
				Number(speed),
				settings
			);

			let cpuTimer;

			// Called every "frame" to simulate the game loop
			const timeout = () => {
				game.step();

				const cpuEndResult = game.end();
				if(cpuEndResult !== null) {
					switch(cpuEndResult) {
						case 'Win':
							// TODO: Win animation
							game.socket.emit('gameEnd', cpuId);
							break;
						case 'Loss':
							game.socket.emit('gameOver', cpuId);
							break;
						case 'OppDisconnect':
							// Ignore if CPU wins due to player disconnect
							break;
					}
					this.defeated.push(cpuId);
				}
				else {
					// If CPU game has not ended, recursively set a new timeout
					cpuTimer = setTimeout(timeout, 16.67);
				}
			};

			// Start the timer
			cpuTimer = setTimeout(timeout, 16.67);

			this.games.set(cpuId, { frames: 0, socket, timeout: cpuTimer });
		});

		// Send start to the players
		this.members.forEach((player, gameId) => {
			const opponentIds = allIds.filter(id => id !== gameId);
			this.games.set(gameId, { frames: 0, socket: player.socket });
			player.socket.emit('start', this.roomId, opponentIds, this.settingsString);
		});

		// Send start to the spectators
		this.spectating.forEach(socket => {
			socket.emit(
				'spectate',
				this.roomId,
				Array.from(this.members.keys()).concat(Array.from(this.cpus.keys())),
				this.settingsString
			);
		});

		switch(this.roomType) {
			case 'ffa':
				this.quickPlayTimer = null;
				Room.defaultQueueRoomId = null;
				break;
			case 'ranked':
				Room.rankedRoomId = null;
				break;
		}

		console.log(`Started room ${this.roomId}`);
		this.ingame = true;
	}

	/**
	 * Removes a player from a room (if possible).
	 */
	leave(gameId, notify = true, spectate = false) {
		if(this.spectating.has(gameId)) {
			const socket = this.spectating.get(gameId);
			socket.leave(this.roomId);
			idToRoomId.delete(gameId);
			console.log(`Removed spectator ${gameId} from room ${this.roomId}`);
			return;
		}

		// Select the correct map to remove the player from
		const playerList = (gameId > 0) ? this.members : this.cpus;

		const socket = playerList.get(gameId).socket;
		if(!spectate) {
			socket.leave(this.roomId);
		}

		// Remove player from maps
		playerList.delete(gameId);
		if(this.paused.includes(gameId)) {
			this.paused.splice(this.paused.indexOf(gameId), 1);
		}
		idToRoomId.delete(gameId);

		// Transfer host privileges to next oldest member in room
		if(gameId === this.host) {
			this.host = Array.from(this.members.keys())[0];
		}

		console.log(`Removed ${gameId} from room ${this.roomId}`);

		// Disconnect the CPU socket, since they cannot exist outside of the room
		if(gameId < 0) {
			if(this.games.has(gameId)) {
				clearTimeout(this.games.timeout);
				this.games.delete(gameId);
			}
			socket.disconnect();
			return;
		}

		if(this.ingame) {
			this.games.delete(gameId);

			// Emit midgame disconnect event to all players in the room
			this.games.forEach(player => {
				player.socket.emit('playerDisconnect', gameId);
			});
			return;
		}
		else {
			if(notify) {
				this.members.forEach((player, id) => {
					player.socket.emit(
						'roomUpdate',
						this.roomId,
						Array.from(this.members.keys()).concat(Array.from(this.cpus.keys())),
						this.roomSize,
						this.settingsString,
						this.roomType,
						id === this.host,
						false		// Not spectating
					);
				});

				this.spectating.forEach(spectatorSocket => {
					spectatorSocket.emit(
						'roomUpdate',
						this.roomId,
						Array.from(this.members.keys()).concat(Array.from(this.cpus.keys())),
						this.roomSize,
						this.settingsString,
						this.roomType,
						false,		// Not host
						true		// Spectating
					);
				});
			}

			// Cancel start if not enough players
			if(this.roomType && this.members.size < 2 && this.quickPlayTimer !== null) {
				clearTimeout(this.quickPlayTimer);
				this.quickPlayTimer = null;
				console.log('Cancelled start. Not enough players.');
			}
		}

		// Close room if it contains no more players
		if(this.members.size === 0 && this.roomType === 'default') {
			this.cpus.forEach((cpu, cpuId) => {
				this.leave(cpuId, false);
			});

			// eslint-disable-next-line no-unused-vars
			this.spectating.forEach((spectatorSocket, id) => {
				this.leave(id, false);
				// TODO: Kick to main menu?
			});

			// Clear room entry
			roomIdToRoom.delete(this.roomId);
			roomIds.delete(this.roomId);
			console.log(`Closed room ${this.roomId}`);
		}
	}

	/**
	 * Ends the game.
	 */
	end() {
		this.ingame = false;

		// Stop all CPU timers
		this.games.forEach((player, id) => {
			if(id < 0) {
				clearTimeout(player.timeout);
			}
		});
		this.games.clear();

		// Bring back to room info screen in 5 seconds.
		setTimeout(() => {
			this.members.forEach((player, id) => {
				player.socket.emit(
					'roomUpdate',
					this.roomId,
					Array.from(this.members.keys()).concat(Array.from(this.cpus.keys())),
					this.roomSize,
					this.settingsString,
					this.roomType,
					id === this.host,
					false		// Not spectating
				);
			});

			this.spectating.forEach(socket => {
				socket.emit(
					'roomUpdate',
					this.roomId,
					Array.from(this.members.keys()).concat(Array.from(this.cpus.keys())),
					this.roomSize,
					this.settingsString,
					this.roomType,
					false,		// Not host
					true		// Spectating
				);
			});
		}, 5000);
	}

	/**
	 * Increments the frame counter for a player, and determines whether other games should be paused/resumed.
	 */
	advance(gameId) {
		const thisPlayer = this.games.get(gameId);
		if(thisPlayer === undefined) {
			console.log(`Attempted to advance undefined game with id ${gameId}`);
			return;
		}
		thisPlayer.frames++;

		let minFrames = Infinity, minId = null;

		this.games.forEach((player, id) => {
			if(!this.defeated.includes(id)) {		// Exclude defeated players
				const frames = player.frames;
				if(frames < minFrames) {
					minFrames = frames;
					minId = id;
				}
			}
		});

		// Too fast
		if(thisPlayer.frames - minFrames > MAX_FRAME_DIFFERENCE && !this.paused.includes(gameId)) {
			thisPlayer.socket.emit('pause');
			this.paused.push(gameId);

			// Start timeout if everyone except one player is paused
			if(this.paused.length === this.games.size - 1 && this.timeout === null) {
				this.timeout = setTimeout(() => {
					// Time out the user if they are still in the game
					if(this.games.has(minId)) {
						this.games.get(minId).socket.emit('timeout');
					}

					// Resume all other players
					this.games.forEach((player, id) => {
						if(id !== minId) {
							player.socket.emit('play');
							player.socket.emit('timeoutDisconnect', minId);
						}
					});
					this.leave(minId);
				}, 30000);
			}
		}
		// Catching up
		else if(thisPlayer.frames === minFrames) {
			const toRemove = [];
			this.paused.forEach(id => {
				// Restart every socket that is no longer too far ahead
				if(this.games.get(id).frames - thisPlayer.frames < MAX_FRAME_DIFFERENCE - 5) {
					this.games.get(id).socket.emit('play');
					toRemove.push(id);
				}
			});

			// Remove the restarted ids
			this.paused = this.paused.filter(id => !toRemove.includes(id));

			// If anyone has resumed, stop timeout
			if(this.paused.length < this.games.size - 1 && this.timeout !== null) {
				clearTimeout(this.timeout);
				this.timeout = null;
			}
		}
	}

	/* ------------------------------ Helper Methods (RoomManager) ------------------------------*/

	static createRoom(gameId, members, host, roomSize, settingsString, roomType = 'default') {
		const room = new Room(members, host, roomSize, settingsString, roomType);
		roomIdToRoom.set(room.roomId, room);
		return room;
	}

	static changeSettings(gameId, settingsString, roomSize) {
		const room = roomIdToRoom.get(idToRoomId.get(gameId));

		room.changeSettings(settingsString, roomSize);
		return room;
	}

	static joinRoom(gameId, roomId, socket, cpuInfo) {
		const room = roomIdToRoom.get(roomId);

		if(room === undefined) {
			socket.emit('joinFailure', `The room you are trying to join ${roomId ? `(id ${roomId}) `:''}does not exist.`);
			return;
		}

		room.join(gameId, socket, cpuInfo);
		return room;
	}

	static spectateRoom(gameId, socket, roomId = null) {
		const room = (roomId === null) ? roomIdToRoom.get(idToRoomId.get(gameId)) : roomIdToRoom.get(roomId);

		if(room === undefined) {
			socket.emit('spectateFailure', 'The room you are trying to join does not exist or has ended.');
			return;
		}

		if(room.members.size === 1) {
			socket.emit('showDialog', 'You cannot spectate a room if you are the only player.');
			return;
		}

		room.spectate(gameId, socket);
		return room;
	}

	static startRoom(roomId = null, gameId, socket) {
		const room = roomId === null ? roomIdToRoom.get(idToRoomId.get(gameId)) : roomIdToRoom.get(roomId);
		if(room.members.size + room.cpus.size > 1) {
			room.start();
		}
		else {
			socket.emit('showDialog', 'There are not enough players in the room to start.');
		}
		return room;
	}

	static endRoom(roomId) {
		const room = roomIdToRoom.get(roomId);
		room.end();
		return room;
	}

	static leaveRoom(gameId, roomId = null, notify = false) {
		// The old roomId is explicitly provided when force disconnecting from a room, since joining happens faster than leaving
		const room = (roomId === null) ? roomIdToRoom.get(idToRoomId.get(gameId)) : roomIdToRoom.get(roomId);

		if(room === undefined) {
			if(notify) {
				console.log(`Attempted to remove ${gameId}, but they were not in a room.`);
			}
			return;
		}
		room.leave(gameId);
		return room;
	}

	/**
	 * Visually adds a CPU to the 'Manage CPUs' modal box (does not actually add a CPU until confirmed.)
	 * Returns the index of the CPU that should be turned on (0-indexed), or -1 if the room is full.
	 */
	static addCpu(gameId) {
		const room = roomIdToRoom.get(idToRoomId.get(gameId));

		if(room.members.size + room.numCpus === room.roomSize) {
			return -1;
		}
		else {
			room.numCpus++;
			return room.numCpus - 1;
		}
	}

	/**
	 * Visually removes a CPU to the 'Manage CPUs' modal box (does not actually remove a CPU until confirmed.)
	 * Returns the index of the CPU that should be turned off (0-indexed), or -1 if there are no CPUs.
	 */
	static removeCpu(gameId) {
		const room = roomIdToRoom.get(idToRoomId.get(gameId));

		if(room.numCpus === 0) {
			return -1;
		}
		else {
			room.numCpus--;
			return room.numCpus;
		}
	}

	/**
	 * Returns the current list of CPUs in the room, or an empty array if there are none.
	 */
	static requestCpus(gameId) {
		const room = roomIdToRoom.get(idToRoomId.get(gameId));

		if(room.numCpus === 0) {
			return [];
		}
		else {
			const cpuInfos = Array.from(room.cpus.values());
			const cpus = [];		// The cpuInfo object has too much data. Only send the speed and AI of each CPU.

			cpuInfos.forEach(cpuInfo => {
				const { ai, speed } = cpuInfo;
				// Undo the speed conversion
				cpus.push({ ai, speed: 10 - (speed / 500) });
			});

			return cpus;
		}
	}

	static setCpus(gameId, cpuInfos) {
		const room = roomIdToRoom.get(idToRoomId.get(gameId));

		// Disconnect previous cpus
		room.cpus.forEach((cpu, cpuId) => {
			room.leave(cpuId);
		});

		// Set new cpus and update the size
		room.cpus = cpuInfos;
		room.numCpus = room.cpus.size;

		room.cpus.forEach((cpu, cpuId) => {
			room.join(cpuId, cpu.socket, cpu);
		});
	}

	static advanceFrame(gameId) {
		const room = roomIdToRoom.get(idToRoomId.get(gameId));

		if(room === undefined) {
			console.log(`Received sendState from gameId ${gameId}, but they were not in a room.`);
			return;
		}

		room.advance(gameId);
	}

	static beenDefeated(gameId, roomId) {
		const room = roomIdToRoom.get(roomId);

		room.defeated.push(gameId);
	}

	/**
	 * Returns a list of room ids excluding the one the player is already part of.
	 */
	static getAllRooms(gameId) {
		return Array.from(roomIds).filter(id => {
			const room = roomIdToRoom.get(id);
			return !room.members.has(gameId);
		});
	}

	/**
	 * Returns a list of the players in the room, if the room is valid.
	 */
	static getPlayers(roomId) {
		const room = roomIdToRoom.get(roomId);

		if(room === undefined) {
			return [];
		}
		return Array.from(room.members.keys());
	}

	static getRoomIdFromId(gameId) {
		return idToRoomId.get(gameId);
	}
}

const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateRoomId(length = 6) {
	let result;
	do {
		result = '';
		for (let i = 0; i < length; i++) {
			result += validChars.charAt(Math.floor(Math.random() * validChars.length));
		}
	}
	while(roomIds.has(result));

	roomIds.add(result);
	return result;
}

Room.defaultQueueRoomId = null;
Room.rankedRoomId = null;

module.exports = { Room };