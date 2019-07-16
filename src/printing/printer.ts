import { PrintItem, PrintItemKind, Signal, Condition, Unknown, PrintItemIterator, Info, WriterInfo } from "../types";
import { assertNever, RepeatableIterator } from "../utils";
import { Writer, WriterState } from "./Writer";

// todo: for performance reasons, when doing look aheads, it should only leap back if the condition changes

export interface PrintOptions {
    maxWidth: number;
    indentSize: number;
    useTabs: boolean;
    newLineKind: "\r\n" | "\n";
}

interface SavePoint {
    /** Name for debugging purposes. */
    name?: string;
    depth: number;
    newlineGroupDepth: number;
    childIndex: number;
    writerState: WriterState;
    possibleNewLineSavePoint: SavePoint | undefined;

    minDepthFound: number;
    minDepthChildIndex: number;
    uncomittedItems: PrintItem[];
}

const exitSymbol = Symbol("Thrown to exit when down a depth.");

// todo: separate out more of this code (ex. resolving conditions, infos, and dealing with save points could be in separate classes)

export function print(iterator: PrintItemIterator, options: PrintOptions) {
    // setup
    const writer = new Writer(options);
    const resolvedConditions = new Map<Condition, boolean>();
    const resolvedInfos = new Map<Info, WriterInfo>();
    const lookAheadSavePoints = new Map<Condition | Info, SavePoint>();
    let possibleNewLineSavePoint: SavePoint | undefined;
    let depth = 0;
    let childIndex = 0;
    let newlineGroupDepth = 0;
    let savePointToResume: SavePoint | undefined;
    let lastLog: string | undefined;

    writer.onNewLine(() => {
        possibleNewLineSavePoint = undefined;
    });

    // print and get final string
    printItems(iterator);

    return writer.toString();

    function printItems(items: PrintItemIterator) {
        childIndex = 0;

        for (const item of items) {
            const previousChildIndex = childIndex;
            try {
                printPrintItem(item);
            } catch (err) {
                if (err !== exitSymbol || savePointToResume == null || depth !== savePointToResume.minDepthFound)
                    throw err;
                updateStateToSavePoint(savePointToResume);
            }

            childIndex = previousChildIndex + 1;
        }
    }

    function printPrintItem(printItem: PrintItem) {
        addToUncommittedItemsIfNecessary(printItem);

        // todo: nest all these function within printPrintItem to prevent
        // them from being used elsewhere
        if (typeof printItem === "number")
            printSignal(printItem);
        else if (typeof printItem === "string")
            printString(printItem);
        else if (printItem.kind === PrintItemKind.Unknown)
            printUnknown(printItem);
        else if (printItem.kind === PrintItemKind.Condition)
            printCondition(printItem);
        else if (printItem.kind === PrintItemKind.Info)
            resolveInfo(printItem);
        else
            assertNever(printItem);

        // logWriterForDebugging();

        function printSignal(signal: Signal) {
            if (signal === Signal.ExpectNewLine)
                writer.markExpectNewLine();
            else if (signal === Signal.NewLine)
                markPossibleNewLineIfAble(signal);
            else if (signal === Signal.SpaceOrNewLine) {
                if (isAboveMaxWidth(1)) {
                    const saveState = possibleNewLineSavePoint;
                    if (saveState == null || saveState.newlineGroupDepth >= newlineGroupDepth)
                        writer.write(options.newLineKind);
                    else {
                        if (possibleNewLineSavePoint != null)
                            revertToSavePointPossiblyThrowing(possibleNewLineSavePoint);
                    }
                }
                else {
                    markPossibleNewLineIfAble(signal);
                    writer.write(" ");
                }
            }
            else if (signal === Signal.StartIndent)
                writer.startIndent();
            else if (signal === Signal.FinishIndent)
                writer.finishIndent();
            else if (signal === Signal.StartHangingIndent)
                writer.startHangingIndent();
            else if (signal === Signal.FinishHangingIndent)
                writer.finishHangingIndent();
            else if (signal === Signal.StartNewlineGroup)
                newlineGroupDepth++;
            else if (signal === Signal.FinishNewLineGroup)
                newlineGroupDepth--;
            else
                assertNever(signal);
        }

        function printString(text: string) {
            // todo: this check should only happen during testing
            const isNewLine = text === "\n" || text === "\r\n";
            if (!isNewLine && text.includes("\n"))
                throw new Error("Praser error: Cannot parse text that includes newlines. Newlines must be in their own string.");

            if (!isNewLine && possibleNewLineSavePoint != null && isAboveMaxWidth(text.length))
                revertToSavePointPossiblyThrowing(possibleNewLineSavePoint);
            else
                writer.write(text);
        }

        function printUnknown(unknown: Unknown) {
            if (possibleNewLineSavePoint != null && isAboveMaxWidth(getLineWidth()))
                revertToSavePointPossiblyThrowing(possibleNewLineSavePoint);
            else
                writer.baseWrite(unknown.text);

            function getLineWidth() {
                const index = unknown.text.indexOf("\n");
                if (index === -1)
                    return unknown.text.length;
                else if (unknown.text[index - 1] === "\r")
                    return index - 1;
                return index;
            }
        }

        function printCondition(condition: Condition) {
            const conditionValue = getConditionValue(condition);
            doUpdatingDepth(() => {
                if (conditionValue) {
                    if (condition.true) {
                        const isRepeatableIterator = condition.true instanceof RepeatableIterator;
                        if (!isRepeatableIterator && hasUncomittedItems())
                            condition.true = new RepeatableIterator(condition.true);

                        printItems(condition.true);
                    }
                }
                else {
                    if (condition.false) {
                        const isRepeatableIterator = condition.false instanceof RepeatableIterator;
                        if (!isRepeatableIterator && hasUncomittedItems())
                            condition.false = new RepeatableIterator(condition.false);

                        printItems(condition.false);
                    }
                }
            });
        }
    }

    function markPossibleNewLineIfAble(signal: Signal) {
        if (possibleNewLineSavePoint != null && newlineGroupDepth > possibleNewLineSavePoint.newlineGroupDepth)
            return;

        possibleNewLineSavePoint = createSavePoint(signal);
    }

    function revertToSavePointPossiblyThrowing(savePoint: SavePoint) {
        if (depth === savePoint.minDepthFound) {
            updateStateToSavePoint(savePoint);
            return;
        }

        savePointToResume = savePoint;
        throw exitSymbol;
    }


    function addToUncommittedItemsIfNecessary(printItem: PrintItem) {
        if (possibleNewLineSavePoint != null)
            updateSavePoint(possibleNewLineSavePoint);
        for (const savePoint of lookAheadSavePoints.values())
            updateSavePoint(savePoint);

        function updateSavePoint(savePoint: SavePoint) {
            if (depth > savePoint.minDepthFound)
                return;

            // Add all the items at the top of the tree to the uncommitted items.
            // Their children will be iterated over later.
            if (depth < savePoint.minDepthFound) {
                savePoint.minDepthChildIndex = childIndex;
                savePoint.minDepthFound = depth;
                savePoint.uncomittedItems.push(printItem);
            }
            else if (childIndex > savePoint.minDepthChildIndex) {
                savePoint.minDepthChildIndex = childIndex;
                savePoint.uncomittedItems.push(printItem);
            }
        }
    }

    function updateStateToSavePoint(savePoint: SavePoint) {
        const isForNewLine = possibleNewLineSavePoint === savePoint;
        writer.setState(savePoint.writerState);
        possibleNewLineSavePoint = isForNewLine ? undefined : savePoint.possibleNewLineSavePoint;
        depth = savePoint.depth;
        childIndex = savePoint.childIndex;
        newlineGroupDepth = savePoint.newlineGroupDepth;

        if (isForNewLine)
            writer.write(options.newLineKind);

        const startIndex = isForNewLine ? 1 : 0;
        childIndex += startIndex;
        for (let i = startIndex; i < savePoint.uncomittedItems.length; i++) {
            const previousChildIndex = childIndex;
            printPrintItem(savePoint.uncomittedItems[i]);
            childIndex = previousChildIndex + 1;
        }
    }

    function getConditionValue(condition: Condition): boolean | undefined {
        if (typeof condition.condition === "object") {
            const result = resolvedConditions.get(condition.condition);

            if (result == null) {
                if (!lookAheadSavePoints.has(condition)) {
                    const savePoint = createSavePoint(condition);
                    savePoint.name = condition.name;
                    lookAheadSavePoints.set(condition, savePoint);
                }
            }
            else {
                const savePoint = lookAheadSavePoints.get(condition);
                if (savePoint != null) {
                    lookAheadSavePoints.delete(condition);
                    revertToSavePointPossiblyThrowing(savePoint);
                }
            }

            return result;
        }
        else if (condition.condition instanceof Function) {
            const result = condition.condition({
                getResolvedCondition,
                writerInfo: getWriterInfo(),
                getResolvedInfo: info => getResolvedInfo(info, condition)
            });
            if (result != null)
                resolvedConditions.set(condition, result);
            return result;
        }
        else {
            return assertNever(condition.condition);
        }

        function getResolvedCondition(c: Condition): boolean | undefined;
        function getResolvedCondition(c: Condition, defaultValue: boolean): boolean;
        function getResolvedCondition(c: Condition, defaultValue?: boolean): boolean | undefined {
            const conditionValue = getConditionValue(c);
            if (conditionValue == null)
                return defaultValue;
            return conditionValue;
        }
    }

    function resolveInfo(info: Info) {
        resolvedInfos.set(info, getWriterInfo());

        const savePoint = lookAheadSavePoints.get(info);
        if (savePoint != null) {
            lookAheadSavePoints.delete(info);
            revertToSavePointPossiblyThrowing(savePoint);
        }
    }

    function getResolvedInfo(info: Info, parentCondition: Condition) {
        const resolvedInfo = resolvedInfos.get(info);
        if (resolvedInfo == null && !lookAheadSavePoints.has(info)) {
            const savePoint = createSavePoint(parentCondition);
            savePoint.name = info.name;
            lookAheadSavePoints.set(info, savePoint);
        }
        return resolvedInfo;
    }

    function getWriterInfo(): WriterInfo {
        return {
            lineStartIndentLevel: writer.getLineStartIndentLevel(),
            lineNumber: writer.getLineNumber(),
            columnNumber: writer.getLineColumn()
        };
    }

    function doUpdatingDepth(action: () => void) {
        const previousDepth = depth;
        depth++;

        try {
            action();
        } finally {
            depth = previousDepth;
        }
    }

    function hasUncomittedItems() {
        return possibleNewLineSavePoint != null || lookAheadSavePoints.size > 0;
    }

    function isAboveMaxWidth(offset = 0) {
        // +1 to make the column 1-indexed
        return (writer.getLineColumn() + 1 + offset) > options.maxWidth;
    }

    function createSavePoint(initialItem: PrintItem): SavePoint {
        return {
            depth,
            childIndex,
            newlineGroupDepth,
            writerState: writer.getState(),
            possibleNewLineSavePoint,
            uncomittedItems: [initialItem],
            minDepthFound: depth,
            minDepthChildIndex: childIndex
        };
    }

    function logWriterForDebugging() {
        const currentText = writer.toString();
        if (lastLog === currentText)
            return;

        lastLog = currentText;
        console.log("----");
        console.log(currentText);
    }
}