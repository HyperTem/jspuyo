'use strict';

import { puyoImgs } from './panels';
import { setCreateRoomTrigger } from './panels_custom';
import { pageInit } from './pages';
import { PlayerInfo } from './firebase';
import { UserSettings } from '../utils/Settings';
import { AudioPlayer, VOICES } from '../utils/AudioPlayer';

const playerList = document.getElementById('playerList');
const messageList = document.getElementById('chatMessages');
let messageId = 0;
let lastSender = null;

let currentlyHost = false;

export function mainpageInit(socket: SocketIOClient.Socket, getCurrentUID: () => string, audioPlayer: AudioPlayer): void {
	pageInit();

	const statusClick = document.getElementById('statusClick');
	const statusHover = document.getElementById('statusHover');

	statusClick.onclick = function() {
		statusClick.classList.toggle('open');
		statusHover.classList.toggle('open');
	};

	const voiceSelect = document.getElementById('voiceSelect') as HTMLTableElement;
	let currentRow: HTMLTableRowElement;

	for(const [index, name] of Object.keys(VOICES).entries()) {
		const { colour } = VOICES[name];

		if(index % 4 === 0) {
			currentRow = voiceSelect.insertRow(-1);
		}
		const optionBox = currentRow.insertCell(-1);
		const option = document.createElement('div');
		option.id = `${name}Voice`;

		// Add select functionality for all voice options
		option.onclick = function() {
			audioPlayer.playVoice(name, 'select');
			PlayerInfo.getUserProperty(getCurrentUID(), 'userSettings').then((userSettings: UserSettings) => {
				// De-select old voice
				document.getElementById(`${userSettings.voice}Voice`).classList.remove('selected');

				// Select new voice
				option.classList.add('selected');

				// Update user settings
				userSettings.voice = name;
				PlayerInfo.updateUser(getCurrentUID(), 'userSettings', userSettings);
			}).catch((err) => {
				console.log(err);
			});
		};
		option.classList.add('voiceOption');
		option.style.backgroundColor = rgbaString(...colour, 0.8);

		optionBox.appendChild(option);
	}

	document.querySelectorAll('.roomManageOption').forEach(element => {
		element.addEventListener('click', () => {
			audioPlayer.playSfx('click_option');
		});
	});

	const sendMessageField = document.getElementById('sendMessage') as HTMLInputElement;
	const messageField = document.getElementById('messageField') as HTMLInputElement;
	sendMessageField.addEventListener('submit', event => {
		event.preventDefault();		// Do not refresh the page

		// Send message and clear the input field
		socket.emit('sendMessage', getCurrentUID(), messageField.value);
		messageField.value = '';
	});
	socket.on('sendMessage', (sender: string, message: string) => {
		void addMessage(sender, message);
	});

	const modal = document.getElementById('modal-background');				// The semi-transparent gray background
	const cpuOptionsError = document.getElementById('cpuOptionsError');		// The error message that appears when performing an invalid action (invisible otherwise)
	const cpuOptionsEmpty = document.getElementById('cpuOptionsEmpty');		// The division that indicates there are currently no CPUs (invisible otherwise)

	document.getElementById('manageCpus').onclick = function() {
		toggleHost(currentlyHost);

		modal.style.display = 'block';
		cpuOptionsError.style.display = 'none';
		document.getElementById('cpuOptionsModal').style.display = 'block';
		socket.emit('requestCpus', getCurrentUID());
	};

	socket.on('requestCpusReply', (cpus: { ai: string, speed: number }[]) => {
		// Hide ("delete") all existing CPUs
		document.querySelectorAll('.cpuOption').forEach((option: HTMLElement) => {
			option.style.display = 'none';
		});

		// Then add the current CPUs
		cpus.forEach((cpu, index) => {
			const { ai, speed } = cpu;
			const cpuElement = document.getElementById(`cpu${index + 1}`);
			cpuElement.style.display = 'grid';

			const option: HTMLSelectElement | null = cpuElement.querySelector('.aiOption');
			option.value = ai;

			const slider: HTMLInputElement | null = cpuElement.querySelector('.cpuSpeedSlider');
			slider.value = `${speed}`;
		});
		cpuOptionsEmpty.style.display = (cpus.length === 0) ? 'block' : 'none';
	});

	document.getElementById('cpuOptionsAdd').onclick = function() {
		// Send request to server to add CPU (can only add only up to roomsize)
		socket.emit('addCpu', getCurrentUID());
		audioPlayer.playSfx('submit');
	};

	socket.on('addCpuReply', (index: number) => {
		if(index === -1) {
			// No space in room
			cpuOptionsError.style.display = 'block';
			cpuOptionsError.innerHTML = 'There is no more space in the room.';
			return;
		}
		else if(index === 0) {
			// Adding the first CPU, so remove the empty message
			cpuOptionsEmpty.style.display = 'none';
		}
		// Turn on the cpu at the provided index
		document.getElementById(`cpu${index + 1}`).style.display = 'grid';
		cpuOptionsError.style.display = 'none';
	});

	document.getElementById('cpuOptionsRemove').onclick = function() {
		// Send request to server to remove CPU (can only remove if there are any CPUs)
		socket.emit('removeCpu', getCurrentUID());
		audioPlayer.playSfx('submit');
	};

	socket.on('removeCpuReply', (index: number) => {
		if(index === -1) {
			// No CPUs in room
			cpuOptionsError.style.display = 'block';
			cpuOptionsError.innerHTML = 'There no CPUs currently in the room.';
			return;
		}
		else if(index === 0) {
			// Removing the last CPU, so add the empty message
			cpuOptionsEmpty.style.display = 'block';
		}
		// Turn off the cpu at the provided index
		document.getElementById(`cpu${index + 1}`).style.display = 'none';
		cpuOptionsError.style.display = 'none';
	});

	document.getElementById('cpuOptionsSubmit').onclick = function() {
		const cpus: CpuInfo[] = [];

		document.querySelectorAll('.aiOption').forEach((dropdown: HTMLSelectElement) => {
			// Do not read from invisible options
			if(window.getComputedStyle(dropdown).getPropertyValue('display') === 'block') {
				cpus.push({
					client_socket: null,
					socket: null,
					ai: dropdown.options[dropdown.selectedIndex].value,
					speed: null
				});
			}
		});

		let index = 0;

		document.querySelectorAll('.cpuSpeedSlider').forEach((slider: HTMLInputElement) => {
			// Do not read from invisible options
			if(window.getComputedStyle(slider).getPropertyValue('display') === 'block') {
				// Slider value is between 0 and 10, map to between 5000 and 0
				cpus[index].speed = (10 - Number(slider.value)) * 500;
				index++;
			}
		});

		socket.emit('setCpus', { gameId: getCurrentUID(), cpus });
		audioPlayer.playSfx('submit');

		// Close the CPU options menu
		document.getElementById('cpuOptionsModal').style.display = 'none';
		modal.style.display = 'none';
	};

	document.getElementById('manageSettings').onclick = function() {
		toggleHost(currentlyHost);

		modal.style.display = 'block';
		document.getElementById('createRoomModal').style.display = 'block';
		(document.getElementById('createRoomSubmit') as HTMLInputElement).value = 'Save Settings';

		// Disable the roomsize options
		document.querySelectorAll('.numPlayerButton').forEach(element => {
			element.classList.add('disabled');
		});
		(document.getElementById('5player') as HTMLInputElement).disabled = true;

		// Flag so the submit button causes settings to be changed (instead of creating a new room)
		setCreateRoomTrigger('set');
	};

	document.getElementById('manageRoomPassword').onclick = function() {
		modal.style.display = 'block';
		document.getElementById('roomPasswordModal').style.display = 'block';
	};

	document.getElementById('roomPasswordForm').onsubmit = function (event) {
		// Prevent submit button from refreshing the page
		event.preventDefault();
		const password = (document.getElementById('roomPassword') as HTMLInputElement).value || null;

		socket.emit('setRoomPassword', getCurrentUID(), password);
		audioPlayer.playSfx('submit');

		document.getElementById('roomPasswordModal').style.display = 'none';
		modal.style.display = 'none';
	};

	document.getElementById('manageStartRoom').onclick = function() {
		socket.emit('startRoom', getCurrentUID());
	};

	document.getElementById('manageJoinLink').onclick = function() {
		socket.emit('requestJoinLink', getCurrentUID());
	};

	document.getElementById('manageSpectate').onclick = function() {
		socket.emit('spectate', getCurrentUID());
	};

	document.getElementById('managePlay').onclick = function() {
		socket.emit('joinRoom', { gameId: getCurrentUID() });
	};
}

/**
 * Adds a message to the chat box.
 */
export async function addMessage(sender: string, message: string): Promise<void> {
	if(lastSender === sender) {
		const element = document.getElementById(`message${messageId - 1}`).querySelector('.message');
		element.innerHTML += '<br>' + message;
	}
	else {
		const element = document.createElement('li');
		element.classList.add('chatMsg');
		element.id = `message${messageId}`;
		messageId++;

		const senderElement = document.createElement('span');
		senderElement.innerHTML = await PlayerInfo.getUserProperty(sender, 'username') as string;
		lastSender = sender;
		senderElement.classList.add('senderName');
		element.appendChild(senderElement);

		const messageElement = document.createElement('span');
		messageElement.innerHTML = message;
		messageElement.classList.add('message');
		element.appendChild(messageElement);

		messageList.appendChild(element);
	}
	messageList.scrollTop = messageList.scrollHeight;		// automatically scroll to latest message
}

/**
 * Clears all messages from the chat.
 */
export function clearMessages(): void {
	while(messageList.firstChild) {
		messageList.firstChild.remove();
	}

	// Reset the message states.
	messageId = 0;
	lastSender = null;
}

/**
 * Adds a player to the list of players.
 */
export function addPlayer(name: string, rating: number): void {
	const newPlayer = document.createElement('li');
	newPlayer.classList.add('playerIndividual');
	newPlayer.id = 'player' + name;

	const icon = document.createElement('img');
	icon.src = `images/modal_boxes/${puyoImgs[playerList.childElementCount % puyoImgs.length]}.png`;
	newPlayer.appendChild(icon);

	const playerName = document.createElement('span');
	playerName.innerHTML = name;
	newPlayer.appendChild(playerName);

	const playerRating = document.createElement('span');
	playerRating.innerHTML = `${rating}`;
	newPlayer.appendChild(playerRating);

	playerList.appendChild(newPlayer);
}

/**
 * Removes all players from the list of players.
 */
export function clearPlayers(): void {
	while(playerList.firstChild) {
		playerList.firstChild.remove();
	}
}

/**
 * Updates the playerList to the current array.
 */
export function updatePlayers(players: string[]): void {
	document.getElementById('playersDisplay').style.display = 'block';

	const promises: (Promise<string> | string | number)[] = [];
	// Fetch usernames from the database using the ids
	players.forEach(id => {
		if(id.includes('CPU-')) {
			promises.push(id);
			promises.push(1000);
		}
		else {
			promises.push(PlayerInfo.getUserProperty(id, 'username') as Promise<string>);
			promises.push(PlayerInfo.getUserProperty(id, 'rating') as Promise<string>);
		}
	});

	// Wait for all promises to resolve to usernames, then add them to the player list
	Promise.all(promises).then(playerInfos => {
		clearPlayers();
		for(let i = 0; i < playerInfos.length; i += 2) {
			addPlayer(`${playerInfos[i]}`, Number(playerInfos[i + 1]));
		}
	}).catch((err) => {
		console.log(err);
	});
}

export function hidePlayers(): void {
	clearPlayers();
	document.getElementById('playersDisplay').style.display = 'none';
}

export function toggleHost(host: boolean): void {
	currentlyHost = host;
	// The Add/Remove/Save CPU buttons
	document.getElementById('cpuOptionsButtons').style.display = host ? 'grid' : 'none';

	// The CPU control options
	document.querySelectorAll('.aiOption').forEach((dropdown: HTMLOptionElement) => {
		dropdown.disabled = !host;
	});
	document.querySelectorAll('.cpuSpeedSlider').forEach((slider: HTMLInputElement) => {
		slider.disabled = !host;
	});

	// The main Room Options (Disable the mode icon in future?)
	['numRows', 'numCols', 'numColours'].forEach(elementId => {
		(document.getElementById(elementId) as HTMLInputElement).disabled = !host;
	});

	// The advanced Room Options
	document.querySelectorAll('.roomOptionInput').forEach((input: HTMLInputElement) => {
		input.disabled = !host;
	});

	// The submit button for Room Options
	document.getElementById('createRoomSubmit').style.display = host ? 'block' : 'none';

	// Turn on all the typical room manage options
	document.getElementById('roomManage').querySelectorAll('.player').forEach((element: HTMLElement) => {
		element.style.display = 'grid';
	});

	document.getElementById('manageStartRoom').style.display = host ? 'grid' : 'none';
	document.getElementById('manageRoomPassword').style.display = host ? 'grid' : 'none';
	document.getElementById('managePlay').style.display = 'none';
}

export function toggleSpectate(): void {
	document.getElementById('roomManage').querySelectorAll('.player').forEach((element: HTMLElement) => {
		element.style.display = 'none';
	});
	document.getElementById('managePlay').style.display = 'grid';
}

/**
 * Returns an rgba CSS string, given the RGB + opacity values.
 */
function rgbaString(red?: number, green?: number, blue?: number, opacity = 1) {
	return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}
