// src/common/decorators/api-key.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const API_KEY_protected = 'apiKeyProtected';
export const ApiKeyProtected = () => SetMetadata(API_KEY_protected, true);
