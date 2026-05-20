import { buttonTextVariants, buttonVariants } from "@/src/components/ui/button"
import { NativeOnlyAnimatedView } from "@/src/components/ui/native-only-animated-view"
import { TextClassContext } from "@/src/components/ui/text"
import { useTheme } from "@/src/context/ThemeContext"
import { cn } from "@/src/lib/utils"
import * as AlertDialogPrimitive from "@rn-primitives/alert-dialog"
import * as React from "react"
import { Platform, Pressable, View, type ViewProps } from "react-native"
import { FadeIn, FadeOut } from "react-native-reanimated"
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens"

const AlertDialog = AlertDialogPrimitive.Root

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

const FullWindowOverlay = Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment

function AlertDialogOverlay({
    className,
    children,
    onDismiss,
    ...props
}: Omit<AlertDialogPrimitive.OverlayProps, "asChild"> &
    React.RefAttributes<AlertDialogPrimitive.OverlayRef> & {
        children?: React.ReactNode
        onDismiss?: () => void
    }) {
    return (
        <FullWindowOverlay>
            <AlertDialogPrimitive.Overlay
                className={cn(
                    "absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/50 p-2",
                    Platform.select({
                        web: "animate-in fade-in-0 fixed",
                    }),
                    className
                )}
                {...props}
            >
                <Pressable
                    style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
                    onPress={() => {
                        // Close the dialog when background is tapped.
                        if (onDismiss) {
                            onDismiss()
                        }
                    }}
                >
                    <NativeOnlyAnimatedView entering={FadeIn.duration(200).delay(50)} exiting={FadeOut.duration(150)}>
                        <Pressable
                            onPress={(e) => {
                                // Prevent the dialog content from closing when tapped.
                                e.stopPropagation()
                            }}
                        >
                            {children}
                        </Pressable>
                    </NativeOnlyAnimatedView>
                </Pressable>
            </AlertDialogPrimitive.Overlay>
        </FullWindowOverlay>
    )
}

function AlertDialogContent({
    className,
    portalHost,
    onDismiss,
    ...props
}: AlertDialogPrimitive.ContentProps &
    React.RefAttributes<AlertDialogPrimitive.ContentRef> & {
        portalHost?: string
        onDismiss?: () => void
    }) {
    return (
        <AlertDialogPortal hostName={portalHost}>
            <AlertDialogOverlay onDismiss={onDismiss}>
                <AlertDialogPrimitive.Content
                    className={cn(
                        "bg-background border-border z-50 flex w-full max-w-[calc(100%-2rem)] flex-col gap-4 rounded-lg border p-6 shadow-lg shadow-black/5 sm:max-w-lg",
                        Platform.select({
                            web: "animate-in fade-in-0 zoom-in-95 duration-200",
                        }),
                        className
                    )}
                    {...props}
                />
            </AlertDialogOverlay>
        </AlertDialogPortal>
    )
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
    return (
        <TextClassContext.Provider value="text-center sm:text-left">
            <View className={cn("flex flex-col gap-2", className)} {...props} />
        </TextClassContext.Provider>
    )
}

function AlertDialogFooter({ className, ...props }: ViewProps) {
    return <View className={cn("flex flex-row justify-end gap-2", className)} {...props} />
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.TitleProps & React.RefAttributes<AlertDialogPrimitive.TitleRef>) {
    return <AlertDialogPrimitive.Title className={cn("text-foreground text-lg font-semibold", className)} {...props} />
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.DescriptionProps & React.RefAttributes<AlertDialogPrimitive.DescriptionRef>) {
    return <AlertDialogPrimitive.Description className={cn("text-muted-foreground text-sm", className)} {...props} />
}

function AlertDialogAction({ className, ...props }: AlertDialogPrimitive.ActionProps & React.RefAttributes<AlertDialogPrimitive.ActionRef>) {
    const { colors } = useTheme()
    return (
        <TextClassContext.Provider value={buttonTextVariants({ className })}>
            <AlertDialogPrimitive.Action className={cn(buttonVariants(), "overflow-hidden", className)} android_ripple={{ color: colors.ripple, foreground: true }} {...props} />
        </TextClassContext.Provider>
    )
}

function AlertDialogCancel({ className, ...props }: AlertDialogPrimitive.CancelProps & React.RefAttributes<AlertDialogPrimitive.CancelRef>) {
    const { colors } = useTheme()
    return (
        <TextClassContext.Provider value={buttonTextVariants({ className, variant: "outline" })}>
            <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: "outline" }), "overflow-hidden", className)} android_ripple={{ color: colors.ripple, foreground: true }} {...props} />
        </TextClassContext.Provider>
    )
}

export {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogOverlay,
    AlertDialogPortal,
    AlertDialogTitle,
    AlertDialogTrigger,
}
