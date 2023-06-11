#!/usr/bin/env node
import React from 'react';
import {Text, render} from 'ink';
import meow from 'meow';
import DownloadPage from './pages/DownloadPage.js';
import { checkSetup } from './utils/install.js';
import PromptingPage from './pages/PromptingPage.js';

const cli = meow(
	``,
	{
		importMeta: import.meta,
	},
);

const input = cli.input.join(' ');

if (checkSetup()) {
	const {waitUntilExit} = render(<DownloadPage />);
	await waitUntilExit();
}

if (input.trim() !== '') {
	render(<PromptingPage prompt={input} />);
} else {
	// await completionLoop();
	render(<Text color='red'>No input is given</Text>)
}
