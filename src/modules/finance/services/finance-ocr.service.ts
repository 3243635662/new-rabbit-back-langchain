import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fsp from 'fs/promises';
import * as tencentcloud from 'tencentcloud-sdk-nodejs-ocr';

const OcrClient = tencentcloud.ocr.v20181119.Client;
