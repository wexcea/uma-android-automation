import { createContext, useCallback, useMemo, useState } from "react"

/**
 * Represents a single entry in the message log.
 */
export interface MessageLogEntry {
    /** The sequential message ID from the bot service. */
    id: number
    /** The text content of the log message. */
    message: string
}

/**
 * Data slice of the message log context. Holds the array itself, which gets a new identity on
 * every log push. Subscribe here only if you actually read `messageLog`.
 */
export interface MessageLogDataProps {
    /** The array of all message log entries. */
    messageLog: MessageLogEntry[]
}

/**
 * Dispatch slice of the message log context. Holds identity-stable setters that never change
 * after the first render, so subscribers do not re-commit when the log array changes.
 */
export interface MessageLogDispatchProps {
    /** Direct setter for the entire message log array. */
    setMessageLog: React.Dispatch<React.SetStateAction<MessageLogEntry[]>>
    /** Appends a new message entry to the log. */
    addMessageToLog: (id: number, message: string) => void
}

export const MessageLogDataContext = createContext<MessageLogDataProps>({} as MessageLogDataProps)
export const MessageLogDispatchContext = createContext<MessageLogDispatchProps>({} as MessageLogDispatchProps)

/**
 * Provider component for the message log contexts. Splits the log array and the setters into
 * two separate contexts so high-frequency log pushes from the Kotlin bot service do not
 * re-render every consumer. Only the viewer that actually reads `messageLog` subscribes to
 * the data context. Pages that just clear or append (Home, useBootstrap) subscribe to the
 * stable dispatch context and never re-commit on log churn.
 *
 * @param children The child components to render within the provider.
 * @returns The nested data + dispatch context providers.
 */
export const MessageLogProvider = ({ children }: any): React.ReactElement => {
    const [messageLog, setMessageLog] = useState<MessageLogEntry[]>([])

    /**
     * Add to the message log while keeping track of the sequential message IDs to prevent duplication.
     * @param id The sequential message ID from the bot service.
     * @param message The text content of the log message.
     */
    const addMessageToLog = useCallback((id: number, message: string) => {
        setMessageLog((prev) => [...prev, { id, message }])
    }, [])

    const dataValue = useMemo<MessageLogDataProps>(() => ({ messageLog }), [messageLog])
    const dispatchValue = useMemo<MessageLogDispatchProps>(() => ({ setMessageLog, addMessageToLog }), [addMessageToLog])

    return (
        <MessageLogDataContext.Provider value={dataValue}>
            <MessageLogDispatchContext.Provider value={dispatchValue}>{children}</MessageLogDispatchContext.Provider>
        </MessageLogDataContext.Provider>
    )
}
