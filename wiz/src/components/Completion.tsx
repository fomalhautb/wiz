import React, {useEffect, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import {generateCompletion} from '../utils/openai.js';
import TextInput from './TextInput.js';

type Props = {
	onExit: (input: string) => void;
};

type State = 'typing' | 'generating' | 'finished';

const Completion = ({onExit}: Props) => {
	const [command, setCommand] = useState('');
	const [suggestion, setSuggestion] = useState<string>('');
	const [currentState, setCurrentState] = useState<State>('typing');
	const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
	const {exit} = useApp();

	useInput((input, key) => {
		if (key.return) {
			onExit(command);
			setCurrentState('finished')
		} else if (key.tab) {
			setCommand(prev => prev + suggestion);
		}

		setSuggestion('');
		setCurrentState('typing');

		if (timer) {
			clearTimeout(timer);
		}

		// TODO: handle edit after generation
		setTimer(
			setTimeout(async () => {
				setCurrentState('generating');
				// TODO: this is a hacky way to get the last word, make it more robust later
				const result = await generateCompletion(command + input);
				setSuggestion(result?.completion || '');
				setCurrentState('typing');
			}, 500),
		);
	});

	useEffect(() => {
		if (currentState === 'finished') {
			exit()
		}
	}, [currentState])

	if (currentState == 'finished') {
		return (
			<Box>
				<Text>{'>>> ' + command}</Text>
			</Box>
		);
	} else {
		return (
			<Box>
				<Text>{'>>> '}</Text>
				<TextInput value={command} onChange={setCommand} />
				{currentState === 'generating' ? <Text color="grey">...</Text> : null}
				<Text color="grey">{suggestion}</Text>
			</Box>
		);
	}
};

export default Completion;
