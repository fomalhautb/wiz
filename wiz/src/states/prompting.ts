import {create} from 'zustand';
import {generateCommandStream} from '../utils/openai.js';
import {PromptingResult} from '../types.js';

type PromptingState = {
	isLoading: boolean;
	isError: boolean;
	error: string;
	generation: PromptingResult | null;
	generations: PromptingResult[];
	prompts: string[];
	addPrompt: (prompt: string) => void;
	generate: () => void;
};

export const usePromptingStore = create<PromptingState>((set, get) => ({
	isLoading: false,
	isError: false,
	error: '',
	generation: null,
	generations: [],
	prompts: [],
	addPrompt: prompt => {
		set(state => ({
			prompts: [...state.prompts, prompt],
		}));
	},
	generate: () => {
		set({
			isLoading: true,
			isError: false,
			error: '',
			generations: [...get().generations, {command: '', explaination: ''}],
		});

		generateCommandStream(
			get().prompts,
			get().generations.slice(0, -1),
			generation => {
				if (generation) {
					set({
						isLoading: true,
						generation,
						generations: [...get().generations.slice(0, -1), generation],
					});
				}
			},
		);
	},
}));
