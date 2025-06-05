#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 현재 파일의 디렉토리 경로 가져오기
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 프롬프트 파일에서 읽어오기
let AGENT_PROMPT: string;
try {
  AGENT_PROMPT = readFileSync(join(__dirname, 'agent_prompt.txt'), 'utf-8').trim();
} catch (error) {
  console.error('Error reading agent_prompt.txt:', error);
  process.exit(1);
}

// 도구 정의 (범용적으로 사용 가능)
const AGENT_TOOL: Tool = {
  name: 'activate_agent',
  description: 'Activate the specialized agent with the given context and parameters',
  inputSchema: {
    type: 'object',
    properties: {
      context: {
        type: 'string',
        description: 'Main context or task for the agent to handle',
      },
      additional_info: {
        type: 'string',
        description: 'Additional information or context (optional)',
      },
      parameters: {
        type: 'object',
        description: 'Additional parameters as key-value pairs (optional)',
        additionalProperties: true,
      },
    },
    required: ['context'],
  },
};

class AgentHandler {
  activateWithPrompt(userInput: Record<string, unknown>): { content: Array<{ type: string; text: string }> } {
    const context = userInput.context as string || '';
    const additionalInfo = userInput.additional_info as string || '';
    const parameters = userInput.parameters as Record<string, unknown> || {};
    
    if (!context) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Context is required to activate the agent.'
        }]
      };
    }

    // 사용자 요청 정보 구성
    let userRequest = `User Context: ${context}`;
    
    if (additionalInfo) {
      userRequest += `\nAdditional Information: ${additionalInfo}`;
    }
    
    if (Object.keys(parameters).length > 0) {
      userRequest += `\nParameters: ${JSON.stringify(parameters, null, 2)}`;
    }

    // 최종 프롬프트 구성
    const finalPrompt = `${AGENT_PROMPT}\n\n=== USER REQUEST ===\n${userRequest}\n\nPlease proceed according to the guidelines above.`;

    return {
      content: [{
        type: 'text',
        text: finalPrompt
      }]
    };
  }
}

const server = new Server(
  {
    name: 'generic-agent-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const handler = new AgentHandler();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [AGENT_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'activate_agent') {
    return handler.activateWithPrompt(args || {});
  }

  return {
    content: [{
      type: 'text',
      text: `Unknown tool: ${name}`
    }]
  };
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Generic Agent MCP Server running on stdio');
}

runServer().catch((error) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});