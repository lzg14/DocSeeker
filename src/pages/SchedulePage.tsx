import { useState, useEffect, useCallback } from 'react'
import { ScannedFolder } from '../types'
import { useAppContext } from '../context/AppContext'
import { useLanguage } from '../context/LanguageContext'

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  `${i.toString().padStart(2, '0')}:00`
)

function SchedulePage(): JSX.Element {
  const [folders, setFolders] = useState<ScannedFolder[]>([])
  const [scheduleConfig, setScheduleConfig] = useState({
    enabled: false,
    day: 'monday',
    time: '09:00'
  })
  const { isScanning } = useAppContext()
  const { t } = useLanguage()

  const WEEKDAYS = [
    { value: 'monday', label: t('weekday.monday') },
    { value: 'tuesday', label: t('weekday.tuesday') },
    { value: 'wednesday', label: t('weekday.wednesday') },
    { value: 'thursday', label: t('weekday.thursday') },
    { value: 'friday', label: t('weekday.friday') },
    { value: 'saturday', label: t('weekday.saturday') },
    { value: 'sunday', label: t('weekday.sunday') }
  ]

  const loadFolders = useCallback(async () => {
    try {
      const result = await window.electron.getScannedFolders()
      setFolders(result)

      const enabledFolder = result.find(f => f.schedule_enabled === 1)
      if (enabledFolder) {
        setScheduleConfig({
          enabled: true,
          day: enabledFolder.schedule_day || 'monday',
          time: enabledFolder.schedule_time || '09:00'
        })
      }
    } catch (error) {
      console.error('Failed to load scanned folders:', error)
    }
  }, [])

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  const handleScheduleChange = async (enabled: boolean): Promise<void> => {
    try {
      const newConfig = { ...scheduleConfig, enabled }
      setScheduleConfig(newConfig)

      for (const folder of folders) {
        await window.electron.updateFolderSchedule(
          folder.id!,
          enabled,
          newConfig.day,
          newConfig.time
        )
      }
    } catch (error) {
      console.error('Failed to update schedule:', error)
    }
  }

  const handleDayChange = async (day: string): Promise<void> => {
    try {
      const newConfig = { ...scheduleConfig, day }
      setScheduleConfig(newConfig)

      if (scheduleConfig.enabled) {
        for (const folder of folders) {
          await window.electron.updateFolderSchedule(
            folder.id!,
            true,
            day,
            newConfig.time
          )
        }
      }
    } catch (error) {
      console.error('Failed to update schedule day:', error)
    }
  }

  const handleTimeChange = async (time: string): Promise<void> => {
    try {
      const newConfig = { ...scheduleConfig, time }
      setScheduleConfig(newConfig)

      if (scheduleConfig.enabled) {
        for (const folder of folders) {
          await window.electron.updateFolderSchedule(
            folder.id!,
            true,
            newConfig.day,
            time
          )
        }
      }
    } catch (error) {
      console.error('Failed to update schedule time:', error)
    }
  }

  return (
    <div className="settings-page">
      <h2 className="page-title">{t('config.schedule')}</h2>

      <div className="schedule-global">
        <div className="schedule-controls">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={scheduleConfig.enabled}
              onChange={(e) => handleScheduleChange(e.target.checked)}
              disabled={isScanning || folders.length === 0}
            />
            {t('config.scheduleEnable')}
          </label>

          {scheduleConfig.enabled && (
            <div className="schedule-options">
              <select
                value={scheduleConfig.day}
                onChange={(e) => handleDayChange(e.target.value)}
                disabled={isScanning}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <select
                value={scheduleConfig.time}
                onChange={(e) => handleTimeChange(e.target.value)}
                disabled={isScanning}
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SchedulePage
