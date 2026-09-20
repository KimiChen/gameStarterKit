import { Activity } from '../bean/Activity'
import { ActivityScheduleStore } from '../scheduling/ActivityScheduleStore'

export class ActivityChangeNotifier {
    static async setActivityChange(sId: int, activityVer: string) {
        const version = await ActivityScheduleStore.loadActivityTimeVer(sId)
        if (version !== activityVer) {
            const modActivity = new Activity(sId)
            modActivity.activityVersion = version
        }
    }
}
