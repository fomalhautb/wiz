#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import Completion from './components/Completion.js';
import {spawn} from 'child_process';

// const getErrorString = (error: Error) : string => {
// 	if (error?.code === undefined) {
// 		return error || '';
// 	}

// 	switch (error.code) {
// 		case 'ENOENT':
// 		  return `command not found: ${error.path}`;
// 		case 'EACCES':
// 		  return `permission denied: ${error.path}`;
// 		// add more cases here as needed
// 		default:
// 		  return `Error: ${error.message}`;
// 	  }
// };

const completionLoop = async () => {
	// TODO: handle errors
	while (true) {
		let input = '';
		const {waitUntilExit} = render(<Completion onExit={i => (input = i)} />);
		await waitUntilExit();

		if (input.trim() === 'exit') {
			break;
		}

		await (() => {
			return new Promise((resolve, reject) => {
				const process = spawn('bash', ['-c', ...input.split(' ')], {
					stdio: 'inherit',
				});

				process.on('close', () => {
					resolve(undefined);
				});

				process.on('error', err => {
					resolve(undefined);
				});
			});
		})();
	}
};

export default completionLoop;
