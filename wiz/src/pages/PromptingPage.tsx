import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';

import State from '../components/Selection.js';
import Divider from '../components/Devider.js';
import SyntaxHighlight from '../components/SyntaxHighlight.js';
import EmptyLine from '../components/EmptyLine.js';
import {usePromptingStore} from '../states/prompting.js';
import { executeCommandInBash } from '../utils/bash.js';
import TextInput from '../components/TextInput.js';

type Props = {
	prompt: string;
};

type State = 'selecting' | 'revise' | 'executed';

const PromptingPage = ({prompt}: Props) => {
	const generation = usePromptingStore(state => state.generation);
	const prompts = usePromptingStore(state => state.prompts);
	const addPrompt = usePromptingStore(state => state.addPrompt);
	const generate = usePromptingStore(state => state.generate);

	const {exit} = useApp();

	const [currentState, setCurrentState] = useState<State>('selecting');
	const [revisedPrompt, setRevisedPrompt] = useState<string>('');

	useEffect(() => {
		addPrompt(prompt);
		generate();
	}, [prompt]);

	useInput((input, key) => {
		if (key.return) {
			if (currentState === 'revise') {
				addPrompt(revisedPrompt);
				generate();
				setCurrentState('selecting');
			}
		}
	});

	const action = useMemo(() => {
		if (currentState === 'selecting') {
			return (
				<State
					items={[
						{text: '✅ Execute command'},
						{text: '🎯 Revise prompt'},
						// {text: '📝 Edit myself'},
						{text: '❌ Exit'},
					]}
					onClose={index => {
						if (index === 0) {
							if (!generation?.command) return;
							executeCommandInBash(generation.command);
							exit();
						} else if (index === 1) {
							setCurrentState('revise');
						} else if (index === 2) {
							exit();
						}
					}}
				/>
			);
		} else if (currentState === 'revise') {
			return (
				<Box>
					<Text color="blue">Revise prompt: </Text>
					<TextInput value={revisedPrompt} onChange={setRevisedPrompt} />
				</Box>
			);
		} else {
			return null;
		}
	}, [currentState, revisedPrompt, generation]);

	return (
		<Box flexDirection="column">
			<EmptyLine />
			{prompts.map((prompt, index) => (
				<Text key={index}>
					{prompts.length > 1 ? <Text>({index + 1}) </Text> : null}
					<Text>{prompt}</Text>
				</Text>
			))}
			<EmptyLine />

			<Divider text={'Generated Command'} />
			<EmptyLine />
			<SyntaxHighlight code={generation?.command?.trim() || '...'} language={'bash'} />
			<EmptyLine />

			<Divider text={'Explainations'} />
			<EmptyLine />
			<Text>{generation?.explaination?.trim() || '...'}</Text>
			<EmptyLine />

			<Divider />
			<EmptyLine />
			{action}
			<EmptyLine />
		</Box>
	);
};

export default PromptingPage;
