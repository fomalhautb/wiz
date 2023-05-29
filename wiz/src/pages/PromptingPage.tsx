import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import {spawn} from 'child_process';

import Selection from '../components/Selection.js';
import Divider from '../components/Devider.js';
import SyntaxHighlight from '../components/SyntaxHighlight.js';
import EmptyLine from '../components/EmptyLine.js';
import {usePromptingStore} from '../states/prompting.js';
import TextInput from 'ink-text-input';

type Props = {
	prompt: string;
};

type Selection = 'selecting' | 'revise' | 'executed';

const PromptingPage = ({prompt}: Props) => {
	const generation = usePromptingStore(state => state.generation);
	const prompts = usePromptingStore(state => state.prompts);
	const addPrompt = usePromptingStore(state => state.addPrompt);
	const generate = usePromptingStore(state => state.generate);

	const {exit} = useApp();

	const [currentState, setCurrentState] = useState<Selection>('selecting');
	const [revisedPrompt, setRevisedPrompt] = useState<string>('');
	const [executionResult, setExecutionResult] = useState<string | null>();

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
				<Selection
					items={[
						{text: '✅ Execute command'},
						{text: '🎯 Revise prompt'},
						// {text: '📝 Edit myself'},
						{text: '❌ Exit'},
					]}
					onClose={index => {
						if (index === 0) {
							if (!generation?.command) return;
							const parts = generation.command.split(' ');
							const command = parts[0] || '';
							const args = parts.slice(1);
							spawn(command, args, {stdio: 'inherit'});
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
	}, [currentState, revisedPrompt, generation, executionResult]);

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

			<Divider text={'Generated Query'} />
			<EmptyLine />
			<SyntaxHighlight code={generation?.command || '...'} language={'bash'} />
			<EmptyLine />

			<Divider text={'Explainations'} />
			<EmptyLine />
			<Text>{generation?.explaination || '...'}</Text>
			<EmptyLine />

			<Divider />
			<EmptyLine />
			{action}
			<EmptyLine />
		</Box>
	);
};

export default PromptingPage;
