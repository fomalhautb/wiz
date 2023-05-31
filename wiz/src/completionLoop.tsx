#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import Completion from './components/Completion.js';
import {spawn} from 'child_process';

const completionLoop = async () => {
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
			});
		})();
	}
};

export default completionLoop;
