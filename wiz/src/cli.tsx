#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import Test from './components/Completion.js';
import {spawn} from 'child_process';
import {getConfig} from './utils/config.js';
import SetupPage from './pages/SetupPage.js';
import PromptingPage from './pages/PromptingPage.js';

const cli = meow(
	`
`,
	{
		importMeta: import.meta,
		flags: {
			settings: {
				type: 'boolean',
				shortFlag: 's',
			},
		},
	},
);

const input = cli.input.join(' ');

if (!getConfig('openai_key')) {
	const {waitUntilExit} = render(<SetupPage />);
	await waitUntilExit();
}

if (input.trim() !== '') {
	render(<PromptingPage prompt={input} />);
} else {
	while (true) {
		let input = '';
		const {waitUntilExit} = render(<Test onExit={i => (input = i)} />);
		await waitUntilExit();

		const spawnPromise = (cmd, args) => {
			return new Promise((resolve, reject) => {
				const process = spawn(cmd, args, {stdio: 'inherit'});

				process.on('close', code => {
					if (code !== 0) {
						return reject(
							new Error(`Command "${cmd}" exited with code ${code}`),
						);
					}
					resolve(undefined);
				});
			});
		};

		const parts = input.split(' ');
		const cmd = parts[0] || '';
		const args = parts.slice(1);

		await spawnPromise(cmd, args);
	}
}
