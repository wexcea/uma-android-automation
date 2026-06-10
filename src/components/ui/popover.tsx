import { NativeOnlyAnimatedView } from "@/src/components/ui/native-only-animated-view"
import { TextClassContext } from "@/src/components/ui/text"
import { cn } from "@/src/lib/utils"
import * as PopoverPrimitive from "@rn-primitives/popover"
import * as React from "react"
import { Platform, StyleSheet, View } from "react-native"
import { FadeIn, FadeOut } from "react-native-reanimated"
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const FullWindowOverlay = Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment

function PopoverContent({
    className,
    align = "center",
    sideOffset = 4,
    portalHost,
    scrollable = false,
    ...props
}: PopoverPrimitive.ContentProps &
    React.RefAttributes<PopoverPrimitive.ContentRef> & {
        portalHost?: string
        /**
         * Opt-in for popovers whose body hosts a scrollable ScrollView. On Android the default wrapping overlay is a responder-claiming
         * ancestor of the content, which cancels the native ScrollView's touch stream and kills scrolling. When true the backdrop renders
         * behind the content and the content sits in a full-screen `box-none` layer with its own responder grab disabled, so the inner
         * ScrollView scrolls while backdrop taps still fall through to close. Leave it off for every other popover to keep the default overlay.
         */
        scrollable?: boolean
    }) {
    const inner = (
        <TextClassContext.Provider value="text-popover-foreground">
            <PopoverPrimitive.Content
                align={align}
                sideOffset={sideOffset}
                className={cn(
                    "bg-popover border-border outline-hidden z-50 w-72 rounded-md border p-4 shadow-md shadow-black/5",
                    Platform.select({
                        web: cn(
                            "animate-in fade-in-0 zoom-in-95 origin-(--radix-popover-content-transform-origin) cursor-auto",
                            props.side === "bottom" && "slide-in-from-top-2",
                            props.side === "top" && "slide-in-from-bottom-2"
                        ),
                    }),
                    className
                )}
                {...props}
                {...(scrollable ? { onStartShouldSetResponder: () => false } : {})}
            />
        </TextClassContext.Provider>
    )
    return (
        <PopoverPrimitive.Portal hostName={portalHost}>
            <FullWindowOverlay>
                {scrollable ? (
                    <>
                        <PopoverPrimitive.Overlay style={Platform.select({ native: StyleSheet.absoluteFill })} />
                        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                            {inner}
                        </View>
                    </>
                ) : (
                    <PopoverPrimitive.Overlay style={Platform.select({ native: StyleSheet.absoluteFill })}>
                        <NativeOnlyAnimatedView entering={FadeIn.duration(200)} exiting={FadeOut}>
                            {inner}
                        </NativeOnlyAnimatedView>
                    </PopoverPrimitive.Overlay>
                )}
            </FullWindowOverlay>
        </PopoverPrimitive.Portal>
    )
}

export { Popover, PopoverContent, PopoverTrigger }
