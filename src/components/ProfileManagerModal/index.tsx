import React, { useMemo, useState, useEffect, useCallback } from "react"
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import CustomButton from "../CustomButton"
import { GlassModal } from "../ui/glass-modal"
import { SheetModal } from "../ui/sheet-modal"
import { useProfileManager } from "../../hooks/useProfileManager"
import { Settings } from "../../context/BotStateContext"
import Ionicons from "@react-native-vector-icons/ionicons"
import ProfileComparison from "../ProfileComparison"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"

/** Props for ProfileManagerModal. */
interface ProfileManagerModalProps {
    /** Whether the modal is currently visible. */
    visible: boolean
    /** Callback to close the modal. */
    onClose: () => void
    /** The current training settings used for comparison when overwriting. */
    currentTrainingSettings: Settings["training"]
    /** The current training stat target settings used for comparison when overwriting. */
    currentTrainingStatTargetSettings: Settings["trainingStatTarget"]
    /** Optional callback to apply a profile's settings to the current configuration. */
    onOverwriteSettings?: (settings: Partial<Settings>) => Promise<void>
    /** Optional callback fired after a profile is deleted. */
    onProfileDeleted?: (deletedProfileName: string) => void
    /** Optional callback fired after a profile is renamed or updated. */
    onProfileUpdated?: (oldName?: string, newName?: string) => void
    /** Optional callback fired when no differences are detected between current and profile settings. */
    onNoChangesDetected?: (profileName: string) => void
    /** Optional callback fired when an error occurs. */
    onError?: (message: string) => void
}

/**
 * A bottom-sheet modal for managing saved profiles. Supports inline rename, delete with confirmation, and overwrite-with-comparison.
 * @param visible Whether the modal is visible.
 * @param onClose Callback to close the modal.
 * @param currentTrainingSettings Current training settings for comparison.
 * @param currentTrainingStatTargetSettings Current training stat target settings for comparison.
 * @param onOverwriteSettings Callback to apply profile settings.
 * @param onProfileDeleted Optional callback fired after a profile is deleted.
 * @param onProfileUpdated Optional callback fired after a profile is renamed or updated.
 * @param onNoChangesDetected Optional callback fired when no differences are detected between current and profile settings.
 * @param onError Optional callback for error handling.
 */
const ProfileManagerModal: React.FC<ProfileManagerModalProps> = ({
    visible,
    onClose,
    currentTrainingSettings,
    currentTrainingStatTargetSettings,
    onOverwriteSettings,
    onProfileDeleted,
    onProfileUpdated,
    onNoChangesDetected,
    onError,
}) => {
    const { colors } = useTheme()
    const { profiles, updateProfile, deleteProfile, loadProfiles, compareWithProfile } = useProfileManager(onError)
    const [profileName, setProfileName] = useState("")
    const [editingProfileId, setEditingProfileId] = useState<number | null>(null)
    const [deleteProfileId, setDeleteProfileId] = useState<number | null>(null)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [showComparison, setShowComparison] = useState(false)
    const [overwriteProfileId, setOverwriteProfileId] = useState<number | null>(null)
    const [comparisonData, setComparisonData] = useState<Record<string, { current: any; profile: any }> | null>(null)

    const styles = useMemo(
        () =>
            StyleSheet.create({
                titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
                titleBlock: { gap: 2 },
                title: { ...TYPE.monoLabel, color: colors.text, fontSize: 13, letterSpacing: 1.5 },
                count: { ...TYPE.monoLabel, color: colors.textMuted, fontSize: 10 },
                closeChip: {
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                },
                cardList: { gap: SPACING.sm },
                card: {
                    padding: SPACING.md,
                    borderRadius: RADII.lg,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    backgroundColor: colors.surfaceRaised,
                    gap: SPACING.sm,
                },
                cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
                cardName: { ...TYPE.body, color: colors.text, fontWeight: "600" as const, flex: 1 },
                actionsRow: { flexDirection: "row", gap: SPACING.xs },
                action: {
                    flex: 1,
                    paddingVertical: SPACING.sm,
                    borderRadius: RADII.md,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    alignItems: "center",
                    overflow: "hidden",
                },
                actionPrimary: { borderColor: colors.brand, backgroundColor: colors.brand },
                actionDanger: { borderColor: colors.destructive },
                actionText: { ...TYPE.caption, color: colors.text, fontWeight: "600" as const },
                actionTextPrimary: { color: colors.onBrand },
                actionTextDanger: { color: colors.destructive },
                renameRow: { flexDirection: "row", gap: SPACING.xs, alignItems: "center" },
                renameInput: {
                    flex: 1,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.brandBorder,
                    borderRadius: RADII.md,
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: SPACING.xs,
                    color: colors.text,
                    fontSize: 14,
                },
                renameChip: {
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: SPACING.xs,
                    borderRadius: RADII.md,
                    borderWidth: 1,
                    overflow: "hidden",
                },
                renameSave: { borderColor: colors.brand, backgroundColor: colors.brand },
                renameCancel: { borderColor: colors.borderHair },
                renameChipText: { ...TYPE.caption, fontWeight: "600" as const },
                footerBtn: { width: "100%" },
                emptyState: { padding: SPACING.lg, alignItems: "center" },
                emptyText: { ...TYPE.body, color: colors.textMuted },
                deleteModalContent: {
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 20,
                },
                deleteHeader: {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                },
                deleteTitle: { fontSize: 18, fontWeight: "bold" as const, color: colors.text },
                deleteBody: { color: colors.text, marginBottom: 20 },
                deleteButtons: { flexDirection: "row", gap: SPACING.sm, justifyContent: "space-between" },
            }),
        [colors]
    )

    useEffect(() => {
        if (visible) {
            loadProfiles()
            setProfileName("")
            setEditingProfileId(null)
            setShowComparison(false)
            setOverwriteProfileId(null)
            setComparisonData(null)
            setDeleteProfileId(null)
            setShowDeleteDialog(false)
        }
    }, [visible, loadProfiles])

    /**
     * Starts inline rename for the given profile.
     * @param profileId The ID of the profile to edit.
     */
    const handleEditProfile = useCallback(
        (profileId: number) => {
            const profile = profiles.find((p) => p.id === profileId)
            if (profile) {
                setProfileName(profile.name)
                setEditingProfileId(profileId)
            }
        },
        [profiles]
    )

    /** Commits the pending rename to storage. */
    const handleUpdateProfile = useCallback(async () => {
        if (!profileName.trim() || !editingProfileId) {
            return
        }

        try {
            const newName = profileName.trim()
            await updateProfile(editingProfileId, { name: newName })
            setProfileName("")
            setEditingProfileId(null)
            onProfileUpdated?.()
        } catch (error) {
            const errorMessage = `Failed to update profile: ${error instanceof Error ? error.message : String(error)}`
            onError?.(errorMessage)
        }
    }, [profileName, editingProfileId, updateProfile, onProfileUpdated, onError])

    /**
     * Opens the delete confirmation dialog for the given profile.
     * @param profileId The ID of the profile to delete.
     */
    const handleDeleteClick = useCallback((profileId: number) => {
        setDeleteProfileId(profileId)
        setShowDeleteDialog(true)
    }, [])

    /** Confirms and executes the pending profile deletion. */
    const handleDeleteConfirm = useCallback(async () => {
        if (!deleteProfileId) {
            return
        }

        try {
            const profileToDelete = profiles.find((p) => p.id === deleteProfileId)
            const deletedProfileName = profileToDelete?.name || ""
            await deleteProfile(deleteProfileId)
            await loadProfiles()
            setShowDeleteDialog(false)
            setDeleteProfileId(null)
            if (deletedProfileName) {
                onProfileDeleted?.(deletedProfileName)
            }
        } catch (error) {
            setShowDeleteDialog(false)
            setDeleteProfileId(null)
            const errorMessage = `Failed to delete profile: ${error instanceof Error ? error.message : String(error)}`
            onError?.(errorMessage)
        }
    }, [deleteProfileId, profiles, deleteProfile, loadProfiles, onProfileDeleted, onError])

    /** Cancels the pending profile deletion. */
    const handleDeleteCancel = useCallback(() => {
        setShowDeleteDialog(false)
        setDeleteProfileId(null)
    }, [])

    /** Cancels the active inline rename. */
    const handleCancelEdit = useCallback(() => {
        setProfileName("")
        setEditingProfileId(null)
    }, [])

    /**
     * Initiates a save/overwrite flow for the given profile. Shows a comparison preview if differences exist.
     * @param profileId The ID of the profile to overwrite.
     */
    const handleSaveClick = useCallback(
        (profileId: number) => {
            const profile = profiles.find((p) => p.id === profileId)
            if (!profile || !onOverwriteSettings) {
                return
            }

            const currentSettings: Partial<Settings> = {
                training: currentTrainingSettings,
                trainingStatTarget: currentTrainingStatTargetSettings,
            }
            const comparison = compareWithProfile(profile, currentSettings, ["training", "trainingStatTarget"])

            if (Object.keys(comparison).length > 0) {
                setOverwriteProfileId(profileId)
                setComparisonData(comparison)
                setShowComparison(true)
            } else {
                onNoChangesDetected?.(profile.name)
            }
        },
        [profiles, onOverwriteSettings, compareWithProfile, currentTrainingSettings, currentTrainingStatTargetSettings, onNoChangesDetected]
    )

    /**
     * Confirms and applies the pending profile overwrite.
     * @param profileId The ID of the profile to overwrite.
     */
    const handleConfirmOverwrite = useCallback(
        async (profileId: number) => {
            try {
                const currentSettings: Partial<Settings> = {
                    training: currentTrainingSettings,
                    trainingStatTarget: currentTrainingStatTargetSettings,
                }
                await updateProfile(profileId, { settings: currentSettings })
                setOverwriteProfileId(null)
                setComparisonData(null)
                setShowComparison(false)
                onProfileUpdated?.()
                onClose()
            } catch (error) {
                const errorMessage = `Failed to overwrite settings: ${error instanceof Error ? error.message : String(error)}`
                onError?.(errorMessage)
            }
        },
        [currentTrainingSettings, currentTrainingStatTargetSettings, updateProfile, onProfileUpdated, onClose, onError]
    )

    /** Cancels the pending profile overwrite and hides the comparison view. */
    const handleCancelOverwrite = useCallback(() => {
        setShowComparison(false)
        setOverwriteProfileId(null)
        setComparisonData(null)
    }, [])

    const header = (
        <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
                <Text style={styles.title}>PROFILES</Text>
                <Text style={styles.count}>{`${profiles.length} SAVED`}</Text>
            </View>
            <Pressable style={styles.closeChip} onPress={onClose} android_ripple={{ color: colors.ripple, foreground: true }} accessibilityLabel="Close">
                <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
        </View>
    )

    const footer = (
        <CustomButton onPress={onClose} variant="outline" style={styles.footerBtn}>
            Close
        </CustomButton>
    )

    return (
        <>
            <SheetModal visible={visible} onRequestClose={onClose} header={header} footer={footer}>
                {profiles.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No profiles yet.</Text>
                    </View>
                ) : (
                    <View style={styles.cardList}>
                        {profiles.map((profile) => {
                            const isEditing = editingProfileId === profile.id
                            return (
                                <View key={profile.id} style={styles.card}>
                                    {isEditing ? (
                                        <View style={styles.renameRow}>
                                            <TextInput
                                                style={styles.renameInput}
                                                value={profileName}
                                                onChangeText={setProfileName}
                                                onSubmitEditing={handleUpdateProfile}
                                                autoFocus
                                                autoCapitalize="words"
                                                autoCorrect={false}
                                            />
                                            <Pressable
                                                style={[styles.renameChip, styles.renameSave]}
                                                onPress={handleUpdateProfile}
                                                android_ripple={{ color: colors.ripple, foreground: true }}
                                            >
                                                <Text style={[styles.renameChipText, { color: colors.onBrand }]}>Save</Text>
                                            </Pressable>
                                            <Pressable
                                                style={[styles.renameChip, styles.renameCancel]}
                                                onPress={handleCancelEdit}
                                                android_ripple={{ color: colors.ripple, foreground: true }}
                                            >
                                                <Text style={[styles.renameChipText, { color: colors.text }]}>Cancel</Text>
                                            </Pressable>
                                        </View>
                                    ) : (
                                        <>
                                            <View style={styles.cardTop}>
                                                <Text style={styles.cardName}>{profile.name}</Text>
                                            </View>
                                            <View style={styles.actionsRow}>
                                                <Pressable
                                                    style={styles.action}
                                                    onPress={() => handleEditProfile(profile.id)}
                                                    android_ripple={{ color: colors.ripple, foreground: true }}
                                                >
                                                    <Text style={styles.actionText}>Rename</Text>
                                                </Pressable>
                                                {onOverwriteSettings ? (
                                                    <Pressable
                                                        style={[styles.action, styles.actionPrimary]}
                                                        onPress={() => handleSaveClick(profile.id)}
                                                        android_ripple={{ color: colors.ripple, foreground: true }}
                                                    >
                                                        <Text style={[styles.actionText, styles.actionTextPrimary]}>Save</Text>
                                                    </Pressable>
                                                ) : null}
                                                <Pressable
                                                    style={[styles.action, styles.actionDanger]}
                                                    onPress={() => handleDeleteClick(profile.id)}
                                                    android_ripple={{ color: colors.ripple, foreground: true }}
                                                >
                                                    <Text style={[styles.actionText, styles.actionTextDanger]}>Delete</Text>
                                                </Pressable>
                                            </View>
                                        </>
                                    )}
                                </View>
                            )
                        })}
                    </View>
                )}

                {showComparison && comparisonData && overwriteProfileId && (
                    <ProfileComparison
                        comparison={comparisonData}
                        onConfirm={() => handleConfirmOverwrite(overwriteProfileId)}
                        onCancel={handleCancelOverwrite}
                        actionType="overwrite"
                        category="training"
                    />
                )}
            </SheetModal>

            <GlassModal visible={showDeleteDialog} onRequestClose={handleDeleteCancel} contentStyle={styles.deleteModalContent} dismissOnBackdropPress={false}>
                <View style={styles.deleteHeader}>
                    <Text style={styles.deleteTitle}>Delete Profile</Text>
                    <Pressable style={styles.closeChip} onPress={handleDeleteCancel} android_ripple={{ color: colors.ripple, foreground: true }} accessibilityLabel="Close">
                        <Ionicons name="close" size={18} color={colors.text} />
                    </Pressable>
                </View>
                <Text style={styles.deleteBody}>Are you sure you want to delete this profile? This action cannot be undone.</Text>
                <View style={styles.deleteButtons}>
                    <CustomButton onPress={handleDeleteCancel} variant="outline">
                        Cancel
                    </CustomButton>
                    <CustomButton onPress={handleDeleteConfirm} variant="destructive">
                        Delete
                    </CustomButton>
                </View>
            </GlassModal>
        </>
    )
}

export default ProfileManagerModal
