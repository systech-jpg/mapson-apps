<?php

namespace App\Notifications;

use App\Models\LeaveRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class LeaveDecisionNotification extends Notification
{
    use Queueable;

    public function __construct(public LeaveRequest $leave, public string $outcome)
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
        $label = $this->outcome === 'approved' ? 'disetujui' : 'ditolak';

        return [
            'kind' => 'leave_decision',
            'leave_id' => $this->leave->id,
            'request_number' => $this->leave->request_number,
            'outcome' => $this->outcome,
            'leave_type' => $this->leave->leaveType?->name,
            'message' => "Pengajuan cuti {$this->leave->request_number} telah {$label}.",
            'url' => route('leave.show', $this->leave->id),
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $label = $this->outcome === 'approved' ? 'DISETUJUI' : 'DITOLAK';

        return (new MailMessage)
            ->subject("Cuti {$this->leave->request_number}: {$label}")
            ->line("Pengajuan cuti Anda ({$this->leave->leaveType?->name}) telah {$label}.")
            ->when(filled($this->leave->decision_note), fn ($m) => $m->line("Catatan: {$this->leave->decision_note}"))
            ->action('Lihat Detail', route('leave.show', $this->leave->id));
    }
}
