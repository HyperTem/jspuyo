'use strict';

import * as Vue from 'vue';
import mitt from 'mitt';

import { AudioPlayer } from '../utils/AudioPlayer';
import { CpuVariants } from '../cpu/CpuVariants';
import { PlayerInfo } from './firebase';
import { Settings } from '../utils/Settings';

import { RoomOptionsModal } from './RoomOptionsModal';

export function initCustomPanels(
	app: Vue.App<Element>,
	emitter: ReturnType<typeof mitt>,
	puyoImgs: string[],
	stopCurrentSession: () => Promise<void>,
	socket: SocketIOClient.Socket,
	audioPlayer: AudioPlayer,
	getCurrentUID: () => string
): void {
	// The black overlay that appears when a modal box is shown
	const modal = document.getElementById('modal-background');

	app.component('create-room-modal', RoomOptionsModal);

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
		// Hide the "Copied" message
		document.getElementById('joinIdCopied').style.display = 'none';

		modal.style.display = 'block';
		document.getElementById('giveJoinId').style.display = 'block';
		(document.getElementById('joinIdLink') as HTMLInputElement).value = `${window.location.href.split('?')[0]}?joinRoom=${id}`;
	});

	// Setting the click event for copying link to clipboard
	document.getElementById('copyJoinId').onclick = function() {
		// Select the input field with the link
		(document.getElementById('joinIdLink') as HTMLInputElement).select();
		try {
			// Copy the selected text and show "Copied!" message
			document.execCommand('copy');
			document.getElementById('joinIdCopied').style.display = 'block';
		}
		catch(err) {
			console.warn(err);
		}
		finally {
			// Deselect the input field
			document.getSelection().removeAllRanges();
			audioPlayer.playSfx('submit');
		}
	};

	// Custom - Join Room
	document.getElementById('joinRoom').onclick = () => {
		modal.style.display = 'block';
		document.getElementById('joinRoomModal').style.display = 'block';
	};

	document.getElementById('joinIdForm').onsubmit = async function (event) {
		// Prevent submit button from refreshing the page
		event.preventDefault();
		const joinId = (document.getElementById('joinId') as HTMLInputElement).value;

		await stopCurrentSession();
		socket.emit('joinRoom', { gameId: getCurrentUID(), joinId });
		audioPlayer.playSfx('submit');
	};

	// Received when room cannot be joined
	socket.on('joinFailure', (errMessage: string) => {
		// Display modal elements if they are not already being displayed (e.g. arrived from direct join link)
		modal.style.display = 'block';
		document.getElementById('joinRoomModal').style.display = 'block';

		document.getElementById('joinIdFormError').innerHTML = errMessage;

		// Make the element containing the error message visible
		document.getElementById('joinIdFormError').style.display = 'block';
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

	createCPUOptions(puyoImgs);
}

function createCPUOptions(puyoImgs: string[]) {
	const aiDropdown = document.createElement('select');
	aiDropdown.classList.add('aiOption');

	CpuVariants.getAllCpuNames().forEach(cpuName => {
		const option = document.createElement('option');
		option.value = cpuName;
		option.innerHTML = cpuName;
		aiDropdown.appendChild(option);
	});

	const cpuSpeedSlider = document.createElement('input');
	cpuSpeedSlider.classList.add('cpuSpeedSlider');
	cpuSpeedSlider.type = 'range';
	cpuSpeedSlider.max = '10';
	cpuSpeedSlider.min = '0';
	cpuSpeedSlider.defaultValue = '8';

	const speedDisplay = document.createElement('span');
	speedDisplay.classList.add('option-title', 'speedDisplay');
	speedDisplay.innerHTML = cpuSpeedSlider.defaultValue;

	const aiLabel = document.createElement('span');
	aiLabel.classList.add('option-title', 'aiLabel');
	aiLabel.innerHTML = 'AI';

	const speedLabel = document.createElement('span');
	speedLabel.classList.add('option-title', 'speedLabel');
	speedLabel.innerHTML = 'Speed';

	// Add CPU options selectors
	for(let i = 0; i < 6; i++) {
		const cpuOptionElement = document.createElement('div');
		cpuOptionElement.id = `cpu${i + 1}`;
		cpuOptionElement.classList.add('cpuOption');

		const cpuIcon = document.createElement('img');
		cpuIcon.src = `images/modal_boxes/${puyoImgs[i]}.png`;
		cpuOptionElement.appendChild(cpuIcon);

		cpuOptionElement.appendChild(aiLabel.cloneNode(true));
		cpuOptionElement.appendChild(speedLabel.cloneNode(true));
		cpuOptionElement.appendChild(aiDropdown.cloneNode(true));

		const speedDisplayClone = speedDisplay.cloneNode(true) as HTMLInputElement;
		const cpuSpeedSliderClone = cpuSpeedSlider.cloneNode(true) as HTMLInputElement;
		cpuSpeedSliderClone.oninput = function() {
			speedDisplayClone.innerHTML = cpuSpeedSliderClone.value;
		};
		cpuOptionElement.appendChild(speedDisplayClone);
		cpuOptionElement.appendChild(cpuSpeedSliderClone);

		document.getElementById('cpuOptions').appendChild(cpuOptionElement);
	}
}
