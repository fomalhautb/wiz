import React from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import {useState} from 'react';
import TextInput from 'ink-text-input';

import {spawn} from 'child_process';

const CompletionPage = () => {
	const [command, setCommand] = useState('');
    const [executing, setExecuting] = useState(false);

    const {write} = useStdout();

	useInput((input, key) => {
		if (key.return) {
            write('>>> ' + command + '\n');

			const parts = command.split(' ');
			const cmd = parts[0] || '';
            const args = parts.slice(1);

            if (!cmd) {
                setCommand('');
                return;
            }
			const child = spawn(cmd, args, {stdio: 'inherit'});

			setCommand('');
            setExecuting(true);

            child.on('exit', (code, signal) => {
				setExecuting(false);
			});
		}
	});

    if (executing) {
        return null;
    }

	return (
		<Box flexDirection="column">
			<Box>
				<Text>{'>>> '}</Text>
				<TextInput value={command} onChange={setCommand} />
			</Box>
		</Box>
	);
};

export default CompletionPage;
