import { HttpException, HttpStatus } from '@nestjs/common';

export class FaceNotDetectedException extends HttpException {
    constructor() {
        super('No face detected in the image', HttpStatus.BAD_REQUEST);
    }
}

export class FaceNotMatchedException extends HttpException {
    constructor() {
        super('Face does not match the registered employee', HttpStatus.UNAUTHORIZED);
    }
}

export class InvalidStationException extends HttpException {
    constructor() {
        super('Invalid or inactive check-in station', HttpStatus.FORBIDDEN);
    }
}

export class NoScheduleFoundException extends HttpException {
    constructor() {
        super('No active work schedule found for this time', HttpStatus.NOT_FOUND);
    }
}
