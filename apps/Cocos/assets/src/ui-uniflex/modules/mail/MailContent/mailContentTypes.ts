export interface MailContentRun {
    readonly id: string;
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly color: string;
}
export interface MailContentParagraph {
    readonly id: string;
    readonly height: number;
    readonly runs: readonly MailContentRun[];
}
