import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import {exec} from 'child_process';

import Selection from '../components/Selection.js';
import Divider from '../components/Devider.js';
import SyntaxHighlight from '../components/SyntaxHighlight.js';
import EmptyLine from '../components/EmptyLine.js';
import {useGenerationStore} from '../states/generation.js';
import TextInput from 'ink-text-input';

type Props = {
	prompt: string;
};

type Selection = 'selecting' | 'revise' | 'executed';

const GenerationPage = ({prompt}: Props) => {
	const generation = useGenerationStore(state => state.generation);
	const prompts = useGenerationStore(state => state.prompts);
	const addPrompt = useGenerationStore(state => state.addPrompt);
	const generate = useGenerationStore(state => state.generate);

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
							exec(generation?.command || '', (error, stdout, stderr) => {
								if (error) {
									setExecutionResult(error.message);
								} else {
									setExecutionResult(stdout || stderr);
								}
							});
							setCurrentState('executed');
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
		} else if (currentState === 'executed') {
			// TODO: this is a hack, find a better way to do this 
			setTimeout(() => {
				exit();
			}, 1000);
			return <Text>{executionResult}</Text>;
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

export default GenerationPage;
