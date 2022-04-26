import { sha256 } from 'js-sha256';

export class HashService {
    static sha256(message: string): Buffer {
        return Buffer.from(sha256(message).toString(), 'hex')
    }
}