'use client';

import { createContext, useContext } from 'react';

// The template's parameters, available to every picker of the editor without passing them through each level.
export const ParametersContext = createContext([]);

export function useTemplateParameters() {
  return useContext(ParametersContext);
}
