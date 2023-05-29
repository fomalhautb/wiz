import React, {useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import TextInput from 'ink-text-input';

type Props = {
    onExit: (input: string) => void;
};

const Test = ({onExit} : Props) => {
	const [command, setCommand] = useState('');
	const {exit} = useApp();

	useInput((input, key) => {
		if (key.return) {
            onExit(command);
			exit();
		}
	});

	return (
		<Box>
			<Text>{'>>> '}</Text>
			<TextInput value={command} onChange={setCommand} />
		</Box>
	);
};

export default Test;
