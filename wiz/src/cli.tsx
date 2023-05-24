#!/usr/bin/env node
import React from 'react';
import {Text, render} from 'ink';
import meow from 'meow';
import App from './App.js';

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

render(<App prompt={input} />);