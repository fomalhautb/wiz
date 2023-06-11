#!/usr/bin/env node
import React from 'react';
import {Text, render} from 'ink';
import meow from 'meow';
import {getConfig} from './utils/config.js';
import SetupPage from './pages/SetupPage.js';
import PromptingPage from './pages/PromptingPage.js';
import completionLoop from './completionLoop.js';

const cli = meow(
	``,
	{
		importMeta: import.meta,
	},
);

const input = cli.input.join(' ');

// if (!getConfig('...')) {
// 	const {waitUntilExit} = render(<SetupPage />);
// 	await waitUntilExit();
// }

if (input.trim() !== '') {
	render(<PromptingPage prompt={input} />);
} else {
	// await completionLoop();
	render(<Text>No input is given</Text>)
}
