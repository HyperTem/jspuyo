'use strict';

import mitt from 'mitt';

import { AudioPlayer } from '../utils/AudioPlayer';
import { PlayerInfo, signOut } from './firebase';
import { Settings, UserSettings } from '../utils/Settings';

export const puyoImgs: string[] = ['red', 'blue', 'green', 'yellow', 'purple', 'teal'];

export function initCustomPanels(
	emitter: ReturnType<typeof mitt>,
	clearModal: () => void,
	stopCurrentSession: () => Promise<void>,
	socket: SocketIOClient.Socket,
	audioPlayer: AudioPlayer,
	getCurrentUID: () => string
): void {
	// The black overlay that appears when a modal box is shown
	const modal = document.getElementById('modal-background');

	// Custom - Create Room
	document.getElementById('createRoom').onclick = () => {
		modal.style.display = 'block';
		document.getElementById('createRoomModal').style.display = 'block';
		emitter.emit('setMode', 'create');
		emitter.emit('disableRoomSettings', false);
	};

	emitter.on('submitRoomSettings', ({settings, roomSize, mode}: {settings: Settings, roomSize: number, mode: string}) => {
		const settingsString = Object.assign(new Settings(), settings).toString();
		switch(mode) {
			case 'create':
				void stopCurrentSession().then(() => {
					socket.emit('createRoom', { gameId: getCurrentUID(), settingsString, roomSize });
				});
				break;
			case 'set':
				socket.emit('changeSettings', getCurrentUID(), settingsString, roomSize);
				break;
		}
		audioPlayer.playSfx('submit');

		// Close the CPU options menu
		document.getElementById('createRoomModal').style.display = 'none';
		modal.style.display = 'none';
	});

	// Receiving the id of the newly created room
	socket.on('giveRoomId', (id: string) => {
		emitter.emit('setLink', `${window.location.href.split('?')[0]}?joinRoom=${id}`);

		modal.style.display = 'block';
		document.getElementById('giveJoinId').style.display = 'block';
	});

	// Custom - Join Room
	document.getElementById('joinRoom').onclick = () => {
		modal.style.display = 'block';
		document.getElementById('joinRoomModal').style.display = 'block';
	};

	emitter.on('stopCurrentSession', (callback: () => void) => {
		void stopCurrentSession().then(() => {
			callback();
		});
	});

	// Received when room cannot be joined
	socket.on('joinFailure', (errMessage: string) => {
		// Display modal elements if they are not already being displayed (e.g. arrived from direct join link)
		modal.style.display = 'block';
		document.getElementById('joinRoomModal').style.display = 'block';

		emitter.emit('joinFailure', errMessage);
	});

	// Event received when attempting to join a password-protected room
	socket.on('requireRoomPassword', (roomId: string) => {
		modal.style.display = 'block';
		document.getElementById('joinRoomPasswordModal').style.display = 'block';
		document.getElementById('joinRoomModal').style.display = 'none';
		document.getElementById('joinRoomId').innerHTML = roomId;
	});

	// The form to submit the room password
	document.getElementById('joinRoomPasswordForm').onsubmit = function (event) {
		// Prevent submit button from refreshing the page
		event.preventDefault();
		const roomPassword = (document.getElementById('joinRoomPassword') as HTMLInputElement).value;
		const joinId = document.getElementById('joinRoomId').innerHTML || null;

		socket.emit('joinRoom', { gameId: getCurrentUID(), joinId, roomPassword });
		audioPlayer.playSfx('submit');
	};

	// Event received when entering the wrong password to a password-protected room
	socket.on('joinRoomPasswordFailure', (message: string) => {
		modal.style.display = 'block';
		document.getElementById('joinRoomPasswordModal').style.display = 'block';
		document.getElementById('joinRoomPasswordFormError').innerHTML = message;
		document.getElementById('joinRoomPasswordFormError').style.display = 'block';
	});

	// Custom - Spectate
	document.getElementById('spectate').onclick = () => {
		void stopCurrentSession();
		socket.emit('getAllRooms', getCurrentUID());

		modal.style.display = 'block';
		document.getElementById('spectateRoomModal').style.display = 'block';
	};

	const roomList = document.getElementById('roomList') as HTMLInputElement;
	const roomPlayers = document.getElementById('roomPlayers');

	socket.on('allRooms', (roomIds: string[]) => {
		const roomIdsElement = document.getElementById('roomIds');
		const spectateFormError = document.getElementById('spectateFormError');
		const spectateSubmit = document.getElementById('spectateSubmit') as HTMLButtonElement;

		while(roomIdsElement.firstChild) {
			roomIdsElement.firstChild.remove();
		}

		// Add all the room ids to the dropdown menu
		roomIds.forEach(id => {
			const option = document.createElement('option');
			option.value = id;
			option.innerHTML = id;
			roomIdsElement.appendChild(option);
		});

		if(roomIds.length === 0) {
			roomList.style.display = 'none';
			roomPlayers.style.display = 'none';
			spectateFormError.innerHTML = 'There are no rooms currently available to spectate.';
			spectateFormError.style.display = 'block';
			if(!spectateSubmit.classList.contains('disable')) {
				spectateSubmit.classList.add('disable');
			}
			spectateSubmit.disabled = true;
		}
		else {
			roomList.style.display = 'inline-block';
			spectateFormError.style.display = 'none';
			if(spectateSubmit.classList.contains('disable')) {
				spectateSubmit.classList.remove('disable');
			}
			spectateSubmit.disabled = false;
		}
	});

	// Attempt to display the players in the room by sending a request to the server
	roomList.addEventListener('input', () => {
		// All valid room ids are of length 6
		if(roomList.value.length === 6) {
			socket.emit('getPlayers', roomList.value);
		}
		else {
			roomPlayers.style.display = 'none';
		}
	});

	// Receiving the results of the request
	socket.on('givePlayers', (players: string[]) => {
		// Server returns an empty array if room does not exist
		if(players.length === 0) {
			roomPlayers.style.display = 'none';
		}
		else {
			const promises = players.map(playerId => PlayerInfo.getUserProperty(playerId, 'username'));

			Promise.all(promises).then(playerNames => {
				roomPlayers.style.display = 'block';
				roomPlayers.innerHTML = `Players: ${JSON.stringify(playerNames)}`;
			}).catch((err) => {
				console.log(err);
			});
		}
	});

	document.getElementById('spectateForm').onsubmit = event => {
		// Do not refresh the page on submit
		event.preventDefault();

		socket.emit('spectate', getCurrentUID(), roomList.value);
		audioPlayer.playSfx('submit');
	};

	// Received when attempting to spectate an invalid room
	socket.on('spectateFailure', (errMessage: string) => {
		const spectateFormError = document.getElementById('spectateFormError');

		spectateFormError.innerHTML = errMessage;
		spectateFormError.style.display = 'block';
	});

	document.getElementById('gallery').onclick = async function() {
		void stopCurrentSession();
		// Leave the room
		socket.emit('forceDisconnect');

		let stats;

		try {
			stats = await PlayerInfo.getUserProperty(getCurrentUID(), 'stats');

			// Need to stringify object before storing, otherwise the data will not be stored correctly
			window.localStorage.setItem('stats', JSON.stringify(stats));
		}
		catch(err) {
			// No games played yet. Special warning message?
			window.localStorage.setItem('stats', JSON.stringify([]));
			console.log(err);
		}

		// Redirect to gallery subdirectory
		window.location.assign('/gallery');
	};

	// Profile Panel - Settings
	document.getElementById('settings').onclick = function() {
		void stopCurrentSession();

		modal.style.display = 'block';

		document.getElementById('settingsModal').style.display = 'block';
	};

	emitter.on('saveSettings', (newSettings: UserSettings) => {
		void PlayerInfo.getUserProperty(getCurrentUID(), 'userSettings').then((userSettings: UserSettings) => {
			userSettings = Object.assign(userSettings, newSettings);

			// Configure audio player with new volume settings
			audioPlayer.configureVolume(userSettings);

			// Update values
			PlayerInfo.updateUser(getCurrentUID(), 'userSettings', userSettings);

			audioPlayer.playSfx('submit');
			clearModal();
		});

	});

	// User Panel - Log Out
	document.getElementById('logout').onclick = function() {
		socket.emit('forceDisconnect', getCurrentUID());
		socket.emit('unlinkUser');
		void signOut();
	};
}
