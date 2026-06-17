<?php

namespace App\Notifications;

use App\Models\OvertimePeriod;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class OvertimePendingApprovalNotification extends Notification
{
    use Queueable;

    public function __construct(public OvertimePeriod $overtime)
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
            'kind' => 'overtime_pending',
            'overtime_id' => $this->overtime->id,
            'request_number' => $this->overtime->request_number,
            'employee' => $this->overtime->employee?->full_name,
            'period' => $this->overtime->period,
            'message' => "Pengajuan lembur {$this->overtime->employee?->full_name} menunggu persetujuan Anda.",
            'url' => route('overtime.approvals.index'),
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Persetujuan Lembur: {$this->overtime->request_number}")
            ->line("Pengajuan lembur {$this->overtime->employee?->full_name} (periode {$this->overtime->period}) menunggu persetujuan Anda.")
            ->action('Buka Persetujuan Lembur', route('overtime.approvals.index'));
    }
}
