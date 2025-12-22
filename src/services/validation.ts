// Fastify JSON Schema validation for API endpoints

export const anthropicMessageSchema = {
  schema: {
    body: {
      type: 'object',
      required: ['model', 'messages', 'max_tokens'],
      properties: {
        model: {
          type: 'string',
          minLength: 1,
        },
        max_tokens: {
          type: 'number',
          minimum: 1,
          maximum: 200000,
        },
        messages: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['role', 'content'],
            properties: {
              role: {
                type: 'string',
                enum: ['user', 'assistant'],
              },
              content: {
                oneOf: [
                  { type: 'string' },
                  { type: 'array' },
                ],
              },
            },
          },
        },
        system: {
          type: 'array',
          items: {
            type: 'object',
          },
        },
        tools: {
          type: 'array',
          items: {
            type: 'object',
          },
        },
        temperature: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
        stream: {
          type: 'boolean',
        },
        metadata: {
          type: 'object',
        },
      },
    },
  },
}
