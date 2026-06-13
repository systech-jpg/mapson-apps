<?php

namespace App\Notifications;

use App\Models\LeaveRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class LeavePendingApprovalNotification extends Notification
{
    use Queueable;

    public function __construct(public LeaveRequest $leave)
    {
    }

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        $channels = ['database'];
        if (config('leave.notify_mail')) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'kind' => 'leave_pending',
            'leave_id' => $this->leave->id,
            'request_number' => $this->leave->request_number,
            'employee' => $this->leave->employee?->full_name,
            'leave_type' => $this->leave->leaveType?->name,
            'start_date' => (string) $this->leave->start_date?->toDateString(),
            'end_date' => (string) $this->leave->end_date?->toDateString(),
            'total_days' => (string) $this->leave->total_days,
            'message' => "Pengajuan cuti {$this->leave->employee?->full_name} menunggu persetujuan Anda.",
            'url' => route('leave.approvals.index'),
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Persetujuan Cuti: {$this->leave->request_number}")
            ->line("Pengajuan cuti {$this->leave->employee?->full_name} ({$this->leave->leaveType?->name}) menunggu persetujuan Anda.")
            ->line("Tanggal: {$this->leave->start_date?->toDateString()} s/d {$this->leave->end_date?->toDateString()} ({$this->leave->total_days} hari).")
            ->action('Buka Persetujuan Cuti', route('leave.approvals.index'));
    }
}
